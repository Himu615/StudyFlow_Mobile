import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, Image, KeyboardAvoidingView, Modal, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { apiRequest, getApiBaseUrl } from "./src/api";
import { enqueueSync, loadTaskCache, readSyncQueue, saveTaskCache, writeSyncQueue } from "./src/offline";

const TOKEN_KEY = "studyflow_token";
const USER_KEY = "studyflow_user";
const NOTIFICATION_KEY = "studyflow_task_notifications";
const ALARM_CHANNEL_ID = "studyflow-task-alarms";
const { StudyFlowAlarm } = NativeModules;
const NAV_ITEMS = ["home", "planner", "today", "insights", "settings"];
const PROFILE_PICTURE_KEY = "studyflow_profile_picture";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function configureAlarmChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: "StudyFlow alarms",
    description: "Loud reminders for due study tasks",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 700, 350, 700],
    enableVibrate: true,
    enableLights: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.MUSIC },
  }).catch(() => {});
}

async function scheduleTaskNotification(task) {
  const notificationMap = JSON.parse((await AsyncStorage.getItem(NOTIFICATION_KEY)) || "{}");
  if (task?._id && notificationMap[task._id]) {
    if (Platform.OS === "android" && StudyFlowAlarm?.cancelAlarm && String(notificationMap[task._id]).startsWith("alarm:")) {
      await StudyFlowAlarm.cancelAlarm(String(task._id)).catch(() => {});
    } else {
      await Notifications.cancelScheduledNotificationAsync(notificationMap[task._id]).catch(() => {});
    }
    delete notificationMap[task._id];
    await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notificationMap));
  }
  if (!task?.dueDate) return;
  const dueDate = new Date(task.dueDate);
  const reminderMinutes = Number(task.reminderMinutesBefore || 0);
  const notificationDate = new Date(dueDate.getTime() - reminderMinutes * 60 * 1000);
  if (Number.isNaN(dueDate.getTime()) || notificationDate.getTime() <= Date.now()) return;
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return;
  }
  if (Platform.OS === "android" && Notifications.getExactAlarmPermissionsAsync && Notifications.requestExactAlarmPermissionsAsync) {
    const exact = await Notifications.getExactAlarmPermissionsAsync().catch(() => null);
    if (exact && !exact.granted) {
      const requestedExact = await Notifications.requestExactAlarmPermissionsAsync().catch(() => null);
      if (requestedExact && !requestedExact.granted) return;
    }
  }
  if (Platform.OS === "android" && StudyFlowAlarm?.scheduleAlarm) {
    const nativeIdentifier = await StudyFlowAlarm.scheduleAlarm(String(task._id), notificationDate.getTime(), task.title);
    notificationMap[task._id] = nativeIdentifier;
    await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notificationMap));
    return;
  }
  const identifier = await Notifications.scheduleNotificationAsync({
    content: { title: reminderMinutes ? "StudyFlow task reminder" : "StudyFlow task due", body: task.title, sound: "default", priority: Notifications.AndroidNotificationPriority.MAX, channelId: ALARM_CHANNEL_ID, data: { taskId: task._id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notificationDate, delivery: "alarmClock", channelId: ALARM_CHANNEL_ID },
  });
  notificationMap[task._id] = identifier;
  await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notificationMap));
}

async function cancelTaskNotification(taskId) {
  const notificationMap = JSON.parse((await AsyncStorage.getItem(NOTIFICATION_KEY)) || "{}");
  if (!notificationMap[taskId]) return;
  if (Platform.OS === "android" && StudyFlowAlarm?.cancelAlarm && String(notificationMap[taskId]).startsWith("alarm:")) {
    await StudyFlowAlarm.cancelAlarm(String(taskId)).catch(() => {});
  } else {
    await Notifications.cancelScheduledNotificationAsync(notificationMap[taskId]).catch(() => {});
  }
  delete notificationMap[taskId];
  await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notificationMap));
}

function localDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Button({ title, onPress, disabled = false }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabledButton, pressed && !disabled && styles.pressedButton]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}

function Field({ label, secureTextEntry, value, onChangeText, keyboardType }) {
  return <View style={styles.fieldGroup}><Text style={styles.label}>{label}</Text><TextInput autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"} autoCorrect={false} keyboardType={keyboardType} onChangeText={onChangeText} placeholder={label} placeholderTextColor="#91a09a" secureTextEntry={secureTextEntry} style={styles.input} value={value} /></View>;
}

function DateTimePickerModal({ value, onChange, onClose }) {
  const source = value ? new Date(value) : new Date();
  const [selectedDate, setSelectedDate] = useState(localDateKey(source));
  const [selectedTime, setSelectedTime] = useState(String(source.getHours()).padStart(2, "0") + ":" + String(source.getMinutes()).padStart(2, "0"));
  const days = Array.from({ length: 90 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + index); return { key: localDateKey(date), label: date.toLocaleDateString(undefined, { weekday: "short" }), short: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }) }; });
  const times = Array.from({ length: 96 }, (_, index) => { const minutes = index * 15; return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"); });
  function confirm() { onChange(selectedDate + "T" + selectedTime); onClose(); }
  return <Modal animationType="slide" transparent visible onRequestClose={onClose}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,47,42,0.45)" }}><View style={{ maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, backgroundColor: "#f5f6f1" }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><Text style={{ color: "#17362f", fontSize: 20, fontWeight: "800" }}>Choose due date & time</Text><Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable></View><Text style={styles.label}>Calendar</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 18 }}>{days.map((day) => <Pressable key={day.key} onPress={() => setSelectedDate(day.key)} style={{ minWidth: 72, alignItems: "center", borderRadius: 14, paddingVertical: 11, backgroundColor: selectedDate === day.key ? "#11806b" : "#fff", borderWidth: 1, borderColor: selectedDate === day.key ? "#11806b" : "#dfe3dc" }}><Text style={{ color: selectedDate === day.key ? "#dff2e9" : "#7b8a83", fontSize: 12, fontWeight: "700" }}>{day.label}</Text><Text style={{ marginTop: 4, color: selectedDate === day.key ? "#fff" : "#17362f", fontWeight: "800" }}>{day.short}</Text></Pressable>)}</ScrollView><Text style={styles.label}>Time</Text><ScrollView style={{ maxHeight: 250, marginBottom: 18 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{times.map((time) => <Pressable key={time} onPress={() => setSelectedTime(time)} style={{ width: "23%", alignItems: "center", borderRadius: 10, paddingVertical: 10, backgroundColor: selectedTime === time ? "#dff2e9" : "#fff", borderWidth: 1, borderColor: selectedTime === time ? "#11806b" : "#dfe3dc" }}><Text style={{ color: selectedTime === time ? "#11806b" : "#62736b", fontWeight: "700" }}>{time}</Text></Pressable>)}</ScrollView><Button title={"Set " + selectedDate + " " + selectedTime} onPress={confirm} /></View></View></Modal>;
}

function TaskForm({ task, initialDueDate, token, userId, onCancel, onSaved }) {
  const [title, setTitle] = useState(task?.title || "");
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [minutes, setMinutes] = useState(String(task?.estimatedMinutes || 25));
  const [dueDate, setDueDate] = useState(localDateTimeInput(task?.dueDate || initialDueDate));
  const [reminder, setReminder] = useState(task?.reminderMinutesBefore ? String(task.reminderMinutesBefore) : "");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!title.trim()) return setError("Task title is required.");
    const estimatedMinutes = Number(minutes);
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 1) return setError("Minutes must be at least 1.");
    if (reminder && !dueDate) return setError("Due date and time are required for a reminder.");
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) return setError("Use due date format YYYY-MM-DDTHH:MM.");
    setBusy(true);
    try {
      const data = await apiRequest(task ? `/tasks/${task._id}` : "/tasks", {
        method: task ? "PATCH" : "POST",
        body: JSON.stringify({ title: title.trim(), priority, estimatedMinutes, dueDate: dueDate || null, reminderMinutesBefore: reminder ? Number(reminder) : null }),
      }, token);
      onSaved(data.task);
    } catch (requestError) {
      if (userId) {
        const localTask = { ...(task || {}), _id: task?._id || `local-${Date.now()}`, title: title.trim(), priority, estimatedMinutes, dueDate: dueDate || null, reminderMinutesBefore: reminder ? Number(reminder) : null, completed: task?.completed || false, offlinePending: true };
        await enqueueSync(userId, task ? { type: "updateTask", id: task._id, patch: { title: localTask.title, priority, estimatedMinutes, dueDate: localTask.dueDate, reminderMinutesBefore: localTask.reminderMinutesBefore } } : { type: "createTask", task: localTask });
        onSaved(localTask);
        return;
      }
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <View style={styles.formCard}>
    <View style={styles.formHeader}><Text style={styles.formTitle}>{task ? "Edit task" : "New task"}</Text><Pressable onPress={onCancel}><Text style={styles.closeText}>Close</Text></Pressable></View>
    <Field label="Task title" value={title} onChangeText={setTitle} />
    <Text style={styles.label}>Priority</Text>
    <View style={styles.priorityRow}>{["low", "medium", "high"].map((item) => <Pressable key={item} onPress={() => setPriority(item)} style={[styles.priorityButton, priority === item && styles.priorityButtonActive]}><Text style={[styles.priorityText, priority === item && styles.priorityTextActive]}>{item}</Text></Pressable>)}</View>
    <View style={styles.fieldGroup}><Text style={styles.label}>Estimated minutes</Text><TextInput keyboardType="numeric" onChangeText={setMinutes} style={styles.input} value={minutes} /></View>
    <View style={styles.fieldGroup}><Text style={styles.label}>Due date and time</Text><Pressable onPress={() => setShowDatePicker(true)} style={[styles.input, { justifyContent: "center" }]}><Text style={{ color: dueDate ? "#17362f" : "#91a09a", fontSize: 16 }}>{dueDate ? dueDate.replace("T", "  ") : "Choose date and time"}</Text></Pressable></View>
    <Text style={styles.label}>Reminder</Text>
    <View style={styles.priorityRow}>{[["", "None"], ["5", "5 min"], ["15", "15 min"], ["30", "30 min"], ["60", "1 hour"], ["1440", "1 day"]].map(([value, label]) => <Pressable key={label} onPress={() => setReminder(value)} style={[styles.reminderButton, reminder === value && styles.priorityButtonActive]}><Text style={[styles.priorityText, reminder === value && styles.priorityTextActive]}>{label}</Text></Pressable>)}</View>
    <TextInput keyboardType="numeric" value={["", "5", "15", "30", "60", "1440"].includes(reminder) ? "" : reminder} onChangeText={(value) => setReminder(value.replace(/[^0-9]/g, ""))} placeholder="Or enter custom minutes" placeholderTextColor="#91a09a" style={styles.input} />
    <Text style={[styles.mutedText, { marginTop: 6 }]}>{reminder ? `Reminder: ${reminder} minutes before due time` : "No reminder set"}</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Button disabled={busy} title={busy ? "Saving..." : task ? "Save changes" : "Add task"} onPress={submit} />
    {showDatePicker ? <DateTimePickerModal value={dueDate} onChange={setDueDate} onClose={() => setShowDatePicker(false)} /> : null}
  </View>;
}

function StudyStructure({ token, mode = "both", tasks = [] }) {
  const [subjects, setSubjects] = useState([]);
  const [goals, setGoals] = useState([]);
  const [subjectName, setSubjectName] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [error, setError] = useState("");

  async function loadStructure() {
    try {
      const [subjectData, goalData] = await Promise.all([apiRequest("/subjects", {}, token), apiRequest("/goals", {}, token)]);
      setSubjects(subjectData.subjects || []);
      setGoals(goalData.goals || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { loadStructure(); }, []);

  async function addSubject() {
    if (!subjectName.trim()) return;
    try {
      const data = await apiRequest("/subjects", { method: "POST", body: JSON.stringify({ name: subjectName.trim(), color: "#11806b" }) }, token);
      setSubjects((current) => [...current, data.subject]);
      setSubjectName("");
      setShowSubjectForm(false);
    } catch (requestError) { setError(requestError.message); }
  }

  async function addGoal() {
    if (!goalTitle.trim()) return;
    try {
      const data = await apiRequest("/goals", { method: "POST", body: JSON.stringify({ title: goalTitle.trim() }) }, token);
      setGoals((current) => [data.goal, ...current]);
      setGoalTitle("");
      setShowGoalForm(false);
    } catch (requestError) { setError(requestError.message); }
  }

  function removeItem(type, item) {
    Alert.alert(`Delete ${type}`, `Delete \"${type === "subject" ? item.name : item.title}\"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await apiRequest(`/${type === "subject" ? "subjects" : "goals"}/${item._id}`, { method: "DELETE" }, token);
          if (type === "subject") setSubjects((current) => current.filter((entry) => entry._id !== item._id));
          else setGoals((current) => current.filter((entry) => entry._id !== item._id));
        } catch (requestError) { setError(requestError.message); }
      } },
    ]);
  }

  function subjectProgress(subject) {
    const linked = tasks.filter((task) => (typeof task.subjectId === "object" ? task.subjectId?._id : task.subjectId) === subject._id);
    return linked.length ? Math.round((linked.filter((task) => task.completed).length / linked.length) * 100) : 0;
  }

  return <View style={styles.structureBlock}>
    {mode !== "goals" ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Subjects</Text><Pressable onPress={() => setShowSubjectForm((value) => !value)}><Text style={styles.refreshText}>+ Add</Text></Pressable></View>
    {showSubjectForm ? <View style={styles.inlineForm}><TextInput onChangeText={setSubjectName} placeholder="Subject name" placeholderTextColor="#91a09a" style={styles.input} value={subjectName} /><Button title="Save subject" onPress={addSubject} /></View> : null}
    {subjects.length === 0 ? <Text style={styles.mutedText}>No subjects yet.</Text> : subjects.map((subject) => <View key={subject._id} style={styles.structureRow}><View style={[styles.colorDot, { backgroundColor: subject.color || "#11806b" }]} /><View style={styles.goalCopy}><Text style={styles.structureName}>{subject.name}</Text><AnimatedPercentBar value={subjectProgress(subject)} color={subject.color || "#11806b"} /></View><Pressable onPress={() => removeItem("subject", subject)}><Text style={styles.deleteText}>Delete</Text></Pressable></View>)}
    </> : null}{mode !== "subjects" ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Goals</Text><Pressable onPress={() => setShowGoalForm((value) => !value)}><Text style={styles.refreshText}>+ Add</Text></Pressable></View>
    {showGoalForm ? <View style={styles.inlineForm}><TextInput onChangeText={setGoalTitle} placeholder="Goal title" placeholderTextColor="#91a09a" style={styles.input} value={goalTitle} /><Button title="Save goal" onPress={addGoal} /></View> : null}
    {goals.length === 0 ? <Text style={styles.mutedText}>No goals yet.</Text> : goals.map((goal) => <View key={goal._id} style={styles.structureRow}><View style={styles.goalDot}><Text style={styles.goalDotText}>◎</Text></View><View style={styles.goalCopy}><Text style={styles.structureName}>{goal.title}</Text><AnimatedPercentBar value={goal.progress} color="#8d70d8" /></View><Pressable onPress={() => removeItem("goal", goal)}><Text style={styles.deleteText}>Delete</Text></Pressable></View>)} </> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

function FocusPanel({ token, tasks = [], isFocusPage = false, onOpenFocus }) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(25 * 60);
  const [selectedTask, setSelectedTask] = useState(null);
  const [focusDate, setFocusDate] = useState(localDateKey());
  const [startedAt, setStartedAt] = useState(null);
  const [message, setMessage] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  function start() {
    const startTime = new Date();
    const totalSeconds = Math.max(60, (Number(selectedTask?.estimatedMinutes) || 25) * 60);
    setStartedAt(startTime);
    setDurationSeconds(totalSeconds);
    setSeconds(totalSeconds);
    setMessage("");
    setRunning(true);
    setPaused(false);
    intervalRef.current = setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
  }

  function togglePause() {
    if (running) {
      clearInterval(intervalRef.current);
      setRunning(false);
      setPaused(true);
      return;
    }
    if (paused) {
      setRunning(true);
      setPaused(false);
      intervalRef.current = setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    }
  }

  async function stop() {
    clearInterval(intervalRef.current);
    setRunning(false);
    const endedAt = new Date();
    const elapsedSeconds = startedAt ? Math.max(0, durationSeconds - seconds) : seconds;
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    try {
      await apiRequest("/study/sessions", { method: "POST", body: JSON.stringify({ startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), durationMinutes }) }, token);
      setMessage(`Saved ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"} study session.`);
    } catch (requestError) {
      setMessage(requestError.message);
    }
    setSeconds(0);
    setStartedAt(null);
    setPaused(false);
  }

  const focusTasks = tasks.filter((task) => !task.completed && (!task.dueDate || localDateKey(task.dueDate) === focusDate));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return <View style={{ marginTop: 16, borderRadius: 24, padding: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cce4e5" }}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Focus session</Text><Text style={{ color: "#123d46", fontSize: 30, fontWeight: "800" }}>{minutes}:{remainingSeconds}</Text></View><Text style={styles.mutedText}>Choose a date and task; the timer uses its estimated minutes.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + index); const key = localDateKey(date); return <Pressable key={key} onPress={() => { setFocusDate(key); setSelectedTask(null); }} style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: focusDate === key ? "#11a889" : "#f1f8f8" }}><Text style={{ color: focusDate === key ? "#fff" : "#66818a", fontSize: 11, fontWeight: "700" }}>{date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</Text></Pressable>; })}</ScrollView>{isFocusPage ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>{focusTasks.slice(0, 12).map((task) => <Pressable key={task._id} disabled={running} onPress={() => { setSelectedTask(task); setDurationSeconds(Math.max(60, (Number(task.estimatedMinutes) || 25) * 60)); setSeconds(Math.max(60, (Number(task.estimatedMinutes) || 25) * 60)); }} style={{ maxWidth: 180, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: selectedTask?._id === task._id ? "#dff2e9" : "#f1f8f8" }}><Text numberOfLines={1} style={{ color: selectedTask?._id === task._id ? "#087b82" : "#123d46", fontWeight: "700" }}>{task.title}</Text><Text style={{ marginTop: 3, color: selectedTask?._id === task._id ? "#087b82" : "#66818a", fontSize: 11 }}>{task.estimatedMinutes || 25} min</Text></Pressable>)}</ScrollView> : null}<View style={styles.focusActions}>{running || paused ? <View style={{ flexDirection: "row", gap: 9 }}><View style={{ flex: 1 }}><Button title={running ? "Pause" : "Resume"} onPress={togglePause} /></View><View style={{ flex: 1 }}><Button title="Stop and save" onPress={stop} /></View></View> : isFocusPage ? <Button title={selectedTask ? "Start task focus" : "Start 25-minute focus"} onPress={start} /> : <Button title="Open Focus" onPress={onOpenFocus} />}</View>{message ? <Text style={styles.successText}>{message}</Text> : null}</View>;
}

function HomeFocusCard({ tasks, onOpenFocus }) {
  const completedMinutes = tasks.filter((task) => task.completed && localDateKey(task.dueDate || task.createdAt) === localDateKey()).reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0);
  const nextTask = tasks.filter((task) => !task.completed && task.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  return <View style={{ marginTop: 18, borderRadius: 24, padding: 19, backgroundColor: "#10a889" }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}><View><Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>Focus Timer</Text><Text style={{ marginTop: 3, color: "#f1ebff", fontSize: 13 }}>Stay productive</Text></View><Pressable onPress={onOpenFocus} style={{ alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.25)" }}><Text style={{ color: "#fff", fontSize: 21 }}>▶</Text></Pressable></View><Text style={{ marginTop: 20, color: "#fff", fontSize: 38, fontWeight: "800", textAlign: "center" }}>25:00</Text><Text style={{ color: "#f1ebff", fontSize: 13, textAlign: "center" }}>Pomodoro session</Text><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 }}><Text style={{ color: "#fff", fontSize: 12 }}>Today: <Text style={{ fontWeight: "800" }}>{completedMinutes}m</Text></Text><Text style={{ color: "#f1ebff", fontSize: 19, letterSpacing: 4 }}>•••</Text></View>{nextTask ? <Text numberOfLines={1} style={{ marginTop: 9, color: "#f1ebff", fontSize: 11 }}>Next: {nextTask.title}</Text> : null}</View>;
}

function HomeDashboard({ auth, tasks, onNavigate, onAddTask, profilePicture, onEditProfilePicture }) {
  const completed = tasks.filter((task) => task.completed).length;
  const health = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const today = localDateKey();
  const todayTasks = tasks.filter((task) => localDateKey(task.dueDate || task.createdAt) === today);
  const todayCompleted = todayTasks.filter((task) => task.completed).length;
  const todayProgress = todayTasks.length ? Math.round((todayCompleted / todayTasks.length) * 100) : 0;
  const upcoming = tasks.filter((task) => !task.completed && task.dueDate && new Date(task.dueDate).getTime() > Date.now()).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 2);
  const progress = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(1)).current;
  const [displayHealth, setDisplayHealth] = useState(0);

  useEffect(() => {
    const listener = progress.addListener(({ value }) => setDisplayHealth(Math.round(value)));
    progress.setValue(0);
    Animated.timing(progress, { toValue: health, duration: 900, useNativeDriver: false }).start();
    return () => progress.removeListener(listener);
  }, [health]);

  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(ringPulse, { toValue: 1.06, duration: 850, useNativeDriver: true }),
      Animated.timing(ringPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, []);

  const actions = [
    ["Today", "today-detail", "today-outline", "#e1f0ff", "#2478b8"],
    ["Task", "tasks", "add-circle-outline", "#fff1d6", "#c8831d"],
    ["Notes", "notes", "document-text-outline", "#ffe5ed", "#c65d82"],
    ["Planner", "planner", "calendar-outline", "#e9e2ff", "#7455c5"],
    ["Goals", "goals", "flag-outline", "#dff5e9", "#168a68"],
    ["Subjects", "subjects", "book-outline", "#e0f6f4", "#087b82"],
    ["Focus", "focus", "timer-outline", "#f0e4ff", "#8a58c7"],
    ["Insights", "insights", "bar-chart-outline", "#e1edff", "#3b71c2"],
  ];

  return <View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ position: "relative", marginRight: 12 }}>{profilePicture ? <Image source={{ uri: profilePicture }} style={{ width: 58, height: 58, borderRadius: 29 }} /> : <View style={{ alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 29, backgroundColor: "#c9f3ec" }}><Text style={{ fontSize: 34 }}>👨‍🎓</Text></View>}<Pressable onPress={() => Alert.alert("Profile photo", "What would you like to do?", [{ text: "Cancel", style: "cancel" }, { text: "Change photo", onPress: onEditProfilePicture }])} style={{ position: "absolute", right: -9, bottom: -8, padding: 2 }}><Ionicons name="pencil" size={13} color="#087b82" /></Pressable></View>
        <View><Text style={styles.smallEyebrow}>STUDYFLOW</Text><Text style={styles.homeTitle}>{auth.user?.name || "Student"}</Text></View>
      </View>
      <Pressable onPress={() => onNavigate("settings")} style={[styles.logoutButton, { backgroundColor: "#fff" }]}><Text style={styles.logoutText}>Profile</Text></Pressable>
    </View>
    <Text style={[styles.greeting, { marginTop: 18 }]}>Good morning, {auth.user?.name || "student"} 👋</Text>
    <Text style={styles.homeSubtitle}>Let’s make today count.</Text>
    <View style={{ marginTop: 18, borderRadius: 20, padding: 18, backgroundColor: "#10a889" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View><Text style={{ color: "#d9fff7", fontSize: 12 }}>Learning health</Text><Text style={{ marginTop: 4, color: "#fff", fontSize: 24, fontWeight: "800" }}>{health >= 80 ? "Excellent" : health >= 50 ? "Good progress" : "Start building"}</Text><Text style={{ marginTop: 4, color: "#d9fff7", fontSize: 11 }}>Based on completed tasks</Text></View>
        <Animated.View style={{ alignItems: "center", justifyContent: "center", width: 70, height: 70, borderRadius: 35, borderWidth: 6, borderColor: "#b8eee0", transform: [{ scale: ringPulse }] }}><Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>{displayHealth}%</Text></Animated.View>
      </View>
      <View style={{ height: 7, marginTop: 16, overflow: "hidden", borderRadius: 7, backgroundColor: "rgba(255,255,255,0.3)" }}><Animated.View style={{ width: progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }), height: "100%", borderRadius: 7, backgroundColor: "#fff" }} /></View>
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22 }}><Text style={styles.sectionTitle}>Quick Actions</Text><Pressable onPress={onAddTask}><Text style={styles.refreshText}>＋ Add task</Text></Pressable></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 10 }}>{actions.map(([label, target, icon, backgroundColor, color]) => <Pressable key={label} onPress={() => label === "Task" ? onAddTask() : onNavigate(target)} style={{ width: "23%", minHeight: 80, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor, borderWidth: 1, borderColor: "#fff" }}><Ionicons name={icon} size={24} color={color} /><Text style={{ marginTop: 6, color: "#274149", fontSize: 10, fontWeight: "800" }}>{label}</Text></Pressable>)}</View>
    <View style={{ marginTop: 24, borderRadius: 18, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e9e8" }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ color: "#087b82", fontSize: 12, fontWeight: "800" }}>TODAY’S PLAN</Text><Text style={[styles.sectionTitle, { marginTop: 4 }]}>{todayCompleted} of {todayTasks.length} tasks completed</Text></View><Pressable onPress={() => onNavigate("today-detail")}><Text style={styles.refreshText}>View all ›</Text></Pressable></View><View style={{ height: 7, marginTop: 13, overflow: "hidden", borderRadius: 7, backgroundColor: "#e6f0ef" }}><View style={{ width: (todayProgress + "%"), height: "100%", borderRadius: 7, backgroundColor: "#10a889" }} /></View></View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}><Text style={styles.sectionTitle}>Upcoming reminders</Text><Pressable onPress={() => onNavigate("planner")}><Text style={styles.refreshText}>View all</Text></Pressable></View>
    {upcoming.length ? upcoming.map((task) => <Pressable key={task._id} onPress={() => onNavigate("planner")} style={{ marginTop: 9, borderRadius: 15, padding: 14, backgroundColor: "#e9e1ff", borderLeftWidth: 4, borderLeftColor: "#9b7ee8" }}><Text style={{ color: "#2d3150", fontSize: 13, fontWeight: "800" }}>{task.title}</Text><Text style={{ marginTop: 4, color: "#6f658b", fontSize: 10 }}>{new Date(task.dueDate).toLocaleString()} · {task.estimatedMinutes || 0} min</Text></Pressable>) : <View style={{ marginTop: 9, borderRadius: 15, padding: 16, backgroundColor: "#fff" }}><Text style={styles.mutedText}>No upcoming reminders.</Text></View>}
    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>This week</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}><View style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#8d70d8", fontSize: 18, fontWeight: "800" }}>{tasks.reduce((sum, task) => sum + (Number(task.estimatedMinutes) || 0), 0)}m</Text><Text style={styles.taskMeta}>Planned time</Text></View><View style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#11a889", fontSize: 18, fontWeight: "800" }}>{completed}</Text><Text style={styles.taskMeta}>Tasks done</Text></View><View style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#3e77c5", fontSize: 18, fontWeight: "800" }}>{tasks.filter((task) => task.dueDate).length}</Text><Text style={styles.taskMeta}>Scheduled</Text></View></View>
  </View>;
}

function TodayPanel({ tasks, onAddTask, onOpenFocus }) {
  const today = localDateKey();
  const todayTasks = tasks.filter((task) => localDateKey(task.dueDate || task.createdAt) === today);
  const completed = todayTasks.filter((task) => task.completed).length;
  const studyMinutes = todayTasks.filter((task) => task.completed).reduce((sum, task) => sum + (Number(task.estimatedMinutes) || 0), 0);
  return <View><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}><View><Text style={styles.sectionTitle}>Today</Text><Text style={[styles.plannerIntro, { marginTop: 5, marginBottom: 0 }]}>Plan your day and keep your progress moving.</Text></View><Pressable onPress={onAddTask} style={[styles.addButton, { borderRadius: 22 }]}><Text style={styles.addButtonText}>＋ Add task</Text></Pressable></View><View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}><View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: "#fff" }}><Text style={styles.mutedText}>Today’s tasks</Text><Text style={styles.summaryValue}>{todayTasks.length}</Text><Text style={styles.taskMeta}>Scheduled today</Text></View><View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: "#fff" }}><Text style={styles.mutedText}>Completed</Text><Text style={styles.summaryValue}>{completed}</Text><Text style={styles.taskMeta}>Completed today</Text></View></View><View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}><View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: "#fff" }}><Text style={styles.mutedText}>Pending</Text><Text style={styles.summaryValue}>{Math.max(0, todayTasks.length - completed)}</Text><Text style={styles.taskMeta}>Pending today</Text></View><View style={{ flex: 1, borderRadius: 14, padding: 13, backgroundColor: "#fff" }}><Text style={styles.mutedText}>Study time</Text><Text style={styles.summaryValue}>{studyMinutes}m</Text><Text style={styles.taskMeta}>Recorded today</Text></View></View><View style={{ marginTop: 18, borderRadius: 18, padding: 17, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e9e8" }}><Text style={{ color: "#087b82", fontSize: 12, fontWeight: "800" }}>TODAY’S WORK</Text><Text style={[styles.sectionTitle, { marginTop: 6 }]}>Task focus</Text>{todayTasks.length === 0 ? <View style={{ marginTop: 14, alignItems: "center", borderRadius: 14, padding: 24, backgroundColor: "#f4f7f6" }}><Text style={styles.emptyText}>No tasks planned for today.</Text></View> : todayTasks.map((task) => <View key={task._id} style={{ marginTop: 10, borderRadius: 12, padding: 12, backgroundColor: task.completed ? "#e5f7f3" : "#f4f7f6" }}><Text style={[styles.taskTitle, task.completed && styles.taskCompleted]}>{task.title}</Text><Text style={styles.taskMeta}>{task.estimatedMinutes || 0} min {task.dueDate ? `· ${new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</Text></View>)}</View><View style={{ marginTop: 16, borderRadius: 18, padding: 17, backgroundColor: "#e5f7f3" }}><Text style={{ color: "#087b82", fontSize: 12, fontWeight: "800" }}>QUICK FOCUS</Text><Text style={[styles.sectionTitle, { marginTop: 6 }]}>Ready to study?</Text><Text style={styles.mutedText}>Start a focused timer for one of today’s tasks.</Text><Pressable onPress={onOpenFocus} style={[styles.addButton, { marginTop: 14, alignItems: "center", borderRadius: 12 }]}><Text style={styles.addButtonText}>Open Focus</Text></Pressable></View></View>;
}

const notesStorageKey = (userId) => `studyflow_notes_${userId || "current"}`;

function NotesPanel({ userId }) {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    async function loadNotes() {
      try {
        const raw = await AsyncStorage.getItem(notesStorageKey(userId));
        setNotes(raw ? JSON.parse(raw) : []);
      } finally {
        setBusy(false);
      }
    }
    loadNotes();
  }, [userId]);

  async function persist(nextNotes) {
    setNotes(nextNotes);
    await AsyncStorage.setItem(notesStorageKey(userId), JSON.stringify(nextNotes));
  }

  async function saveNote() {
    const cleanTitle = title.trim() || "Untitled note";
    const now = new Date().toISOString();
    const nextNotes = editing
      ? notes.map((note) => note.id === editing.id ? { ...note, title: cleanTitle, body, updatedAt: now } : note)
      : [{ id: String(Date.now()), title: cleanTitle, body, createdAt: now, updatedAt: now }, ...notes];
    await persist(nextNotes);
    setEditing(null);
    setTitle("");
    setBody("");
  }

  function startEdit(note) {
    setEditing(note);
    setTitle(note.title);
    setBody(note.body);
  }

  function removeNote(note) {
    Alert.alert("Delete note", `Delete \"${note.title}\"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => persist(notes.filter((item) => item.id !== note.id)) },
    ]);
  }

  const visibleNotes = notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(search.toLowerCase()));

  return <View>
    <View style={styles.notesHeader}><Text style={styles.sectionTitle}>Notepad</Text><Text style={styles.mutedText}>{notes.length} note{notes.length === 1 ? "" : "s"}</Text></View>
    <TextInput value={search} onChangeText={setSearch} placeholder="Search notes" placeholderTextColor="#91a09a" style={styles.input} />
    <View style={styles.noteEditor}>
      <TextInput value={title} onChangeText={setTitle} placeholder="Note title" placeholderTextColor="#91a09a" style={styles.noteTitleInput} />
      <TextInput value={body} onChangeText={setBody} placeholder="Write anything..." placeholderTextColor="#91a09a" multiline textAlignVertical="top" style={styles.noteBodyInput} />
      <View style={styles.noteEditorActions}><Button title={editing ? "Save changes" : "Save note"} onPress={saveNote} /><Pressable onPress={() => { setEditing(null); setTitle(""); setBody(""); }}><Text style={styles.closeText}>Clear</Text></Pressable></View>
    </View>
    {busy ? <ActivityIndicator color="#11806b" /> : null}
    {!busy && visibleNotes.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No notes found</Text><Text style={styles.emptyText}>Write a note above to keep ideas on this device.</Text></View> : null}
    {visibleNotes.map((note) => <View key={note.id} style={styles.noteCard}><Text style={styles.noteCardTitle}>{note.title}</Text><Text style={styles.noteCardBody} numberOfLines={4}>{note.body || "Empty note"}</Text><Text style={styles.noteDate}>{new Date(note.updatedAt).toLocaleString()}</Text><View style={styles.noteActions}><Pressable onPress={() => startEdit(note)}><Text style={styles.editText}>Edit</Text></Pressable><Pressable onPress={() => removeNote(note)}><Text style={styles.deleteText}>Delete</Text></Pressable></View></View>)}
  </View>;
}

function localDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function PlannerPanel({ tasks, token, userId, onSaved }) {
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState("Today");
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return { key: localDateKey(date), date, label: date.toLocaleDateString(undefined, { weekday: "short" }), short: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
  });
  const plannedTasks = tasks.filter((task) => localDateKey(task.dueDate) === selectedDate);
  const totalMinutes = plannedTasks.reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0);
  const completedCount = plannedTasks.filter((task) => task.completed).length;

  return <View><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={styles.sectionTitle}>Personalized Study Plan</Text><Text style={[styles.plannerIntro, { marginTop: 5, marginBottom: 0 }]}>Organize your study by date.</Text></View><Text style={{ color: "#087b82", fontSize: 20 }}>▣</Text></View>
    <View style={{ flexDirection: "row", gap: 7, marginTop: 18, padding: 5, borderRadius: 14, backgroundColor: "#e5f7f3" }}>{["Today", "This week", "This month"].map((item) => <Pressable key={item} onPress={() => setPeriod(item)} style={{ flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 9, backgroundColor: period === item ? "#11a889" : "transparent" }}><Text style={{ color: period === item ? "#fff" : "#66818a", fontSize: 11, fontWeight: "700" }}>{item}</Text></Pressable>)}</View>
    <Text style={{ marginTop: 20, color: "#123d46", fontSize: 16, fontWeight: "800" }}>{new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.dayRow, { paddingTop: 10 }]}>{days.map((day) => <Pressable key={day.key} onPress={() => { setSelectedDate(day.key); setShowForm(false); }} style={[styles.dayCard, selectedDate === day.key && { backgroundColor: "#11a889", borderColor: "#11a889" }]}><Text style={[styles.dayLabel, selectedDate === day.key && styles.dayTextActive]}>{day.label}</Text><Text style={[styles.dayDate, selectedDate === day.key && styles.dayTextActive]}>{day.short}</Text></Pressable>)}</ScrollView>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 13 }}><View><Text style={styles.mutedText}>Planned time</Text><Text style={styles.summaryValue}>{totalMinutes} min</Text></View><View><Text style={styles.mutedText}>Completed</Text><Text style={styles.summaryValue}>{completedCount}/{plannedTasks.length}</Text></View><Pressable onPress={() => setShowForm(true)} style={[styles.addButton, { borderRadius: 20 }]}><Text style={styles.addButtonText}>+ Add task</Text></Pressable></View>
    {showForm ? <TaskForm initialDueDate={`${selectedDate}T09:00`} token={token} userId={userId} onCancel={() => setShowForm(false)} onSaved={(task) => { onSaved(task); setShowForm(false); }} /> : null}
    {plannedTasks.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Nothing planned</Text><Text style={styles.emptyText}>Add a task for this date to start planning.</Text></View> : plannedTasks.map((task) => <View key={task._id} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 10, paddingVertical: 12 }}><View style={{ alignItems: "center", width: 24 }}><View style={[styles.checkbox, { width: 16, height: 16, marginRight: 0 }, task.completed && styles.checkboxDone]}>{task.completed ? <Text style={{ color: "#fff", fontSize: 10 }}>✓</Text> : null}</View><View style={{ width: 2, flex: 1, minHeight: 28, marginTop: 5, backgroundColor: "#c9e8e2" }} /></View><View style={{ flex: 1, marginLeft: 10, borderRadius: 14, padding: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e9e8" }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={[styles.taskTitle, task.completed && styles.taskCompleted]}>{task.title}</Text><Text style={{ color: task.priority === "high" ? "#d35e53" : "#d88d2c", fontSize: 10, fontWeight: "700" }}>{task.priority || "medium"}</Text></View><Text style={styles.taskMeta}>{task.estimatedMinutes || 0} min {task.dueDate ? `· ${new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>{task.reminderMinutesBefore ? <Text style={{ marginTop: 7, color: "#087b82", fontSize: 10 }}>Reminder {task.reminderMinutesBefore} min before</Text> : null}</View></View>)}
  </View>;
}

function TaskActivityChart({ days, maxCount }) {
  return <View style={styles.chartCard}><Text style={styles.sectionTitle}>Tasks added vs completed</Text><Text style={styles.mutedText}>Added / completed per day</Text>{days.map((day) => <View key={day.date} style={{ marginTop: 14 }}><View style={styles.subjectLine}><Text style={styles.chartLabel}>{day.date.slice(5)}</Text><Text style={styles.chartValue}>{day.added} / {day.completed}</Text></View><View style={{ flexDirection: "row", gap: 6, marginTop: 5 }}><AnimatedBar percent={Math.max(3, (day.added / maxCount) * 100)} color="#9ac7b6" /><AnimatedBar percent={day.completed ? Math.max(3, (day.completed / maxCount) * 100) : 0} color="#11806b" /></View></View>)}</View>;
}

function AnimatedBar({ percent, color }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(progress, { toValue: percent, duration: 650, useNativeDriver: false }).start(); }, [percent]);
  const width = progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  return <View style={{ flex: 1, height: 8, overflow: "hidden", borderRadius: 8, backgroundColor: "#edf1ed" }}><Animated.View style={{ width, height: "100%", borderRadius: 8, backgroundColor: color }} /></View>;
}

function AnimatedPercentBar({ value, color = "#11806b" }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(progress, { toValue: percent, duration: 750, useNativeDriver: false }).start(); }, [percent]);
  const width = progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  return <View style={{ flex: 1, marginTop: 7 }}><View style={{ height: 7, overflow: "hidden", borderRadius: 7, backgroundColor: "#edf1ed" }}><Animated.View style={{ width, height: "100%", borderRadius: 7, backgroundColor: color }} /></View><Text style={{ marginTop: 3, color, fontSize: 11, fontWeight: "800" }}>{percent}%</Text></View>;
}

function InsightsPanel({ token }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");

  async function loadInsights() {
    setError("");
    try {
      const [insightData, subjectData, taskData] = await Promise.all([apiRequest(`/study/insights?days=${days}`, {}, token), apiRequest("/subjects", {}, token), apiRequest("/tasks", {}, token)]);
      setData(insightData);
      setSubjects(subjectData.subjects || []);
      setTasks(taskData.tasks || []);
    } catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => { loadInsights(); }, [days]);

  const subjectProgress = subjects.map((subject) => {
    const linked = tasks.filter((task) => (typeof task.subjectId === "object" ? task.subjectId?._id : task.subjectId) === subject._id);
    const completed = linked.filter((task) => task.completed).length;
    return { ...subject, total: linked.length, completed, percent: linked.length ? Math.round((completed / linked.length) * 100) : 0 };
  });
  const maxMinutes = Math.max(1, ...(data?.days || []).map((day) => Number(day.studyMinutes) || 0));
  const taskDays = (data?.days || []).map((day) => {
    const dayTasks = tasks.filter((task) => localDateKey(task.dueDate) === day.date);
    return { ...day, added: dayTasks.length, completed: dayTasks.filter((task) => task.completed).length };
  });
  const maxTaskCount = Math.max(1, ...taskDays.map((day) => Math.max(day.added, day.completed)));

  return <View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={styles.sectionTitle}>Learning Analytics</Text><Text style={[styles.plannerIntro, { marginTop: 5, marginBottom: 0 }]}>Track focus, tasks and progress.</Text></View><Text style={{ color: "#087b82", fontSize: 20 }}>▥</Text></View>
    <View style={{ flexDirection: "row", gap: 7, marginTop: 18, padding: 5, borderRadius: 14, backgroundColor: "#e5f7f3" }}><Pressable onPress={() => setDays(7)} style={{ flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 9, backgroundColor: days === 7 ? "#11a889" : "transparent" }}><Text style={{ color: days === 7 ? "#fff" : "#66818a", fontSize: 11, fontWeight: "700" }}>Weekly</Text></Pressable><Pressable onPress={() => setDays(30)} style={{ flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 9, backgroundColor: days === 30 ? "#11a889" : "transparent" }}><Text style={{ color: days === 30 ? "#fff" : "#66818a", fontSize: 11, fontWeight: "700" }}>Monthly</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!data ? <View style={styles.taskLoading}><ActivityIndicator color="#11806b" /><Text style={styles.loadingText}>Loading insights...</Text></View> : <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }}><View style={{ width: "48%", borderRadius: 16, padding: 15, backgroundColor: "#e5f7f3" }}><Text style={styles.mutedText}>Focus time</Text><Text style={[styles.statValue, { color: "#087b82" }]}>{data.totals?.studyMinutes || 0}m</Text></View><View style={{ width: "48%", borderRadius: 16, padding: 15, backgroundColor: "#fff2dc" }}><Text style={styles.mutedText}>Tasks done</Text><Text style={[styles.statValue, { color: "#d88d2c" }]}>{data.totals?.currentCompletedTasks || 0}</Text></View><View style={{ width: "48%", borderRadius: 16, padding: 15, backgroundColor: "#eef0ff" }}><Text style={styles.mutedText}>Total tasks</Text><Text style={[styles.statValue, { color: "#5874ca" }]}>{data.totals?.totalTasks || 0}</Text></View><View style={{ width: "48%", borderRadius: 16, padding: 15, backgroundColor: "#e9e1ff" }}><Text style={styles.mutedText}>Current streak</Text><Text style={[styles.statValue, { color: "#8d70d8" }]}>{data.streak || 0} days</Text></View></View>
      <View style={styles.chartCard}><Text style={styles.sectionTitle}>Study minutes</Text>{(data.days || []).map((day) => <View key={day.date} style={styles.chartRow}><Text style={styles.chartLabel}>{day.date.slice(5)}</Text><AnimatedBar percent={Math.max(3, ((Number(day.studyMinutes) || 0) / maxMinutes) * 100)} color="#11806b" /><Text style={styles.chartValue}>{day.studyMinutes || 0}m</Text></View>)}</View>
      <View style={styles.chartCard}><Text style={styles.sectionTitle}>Subject progress</Text>{subjectProgress.length === 0 ? <Text style={styles.mutedText}>No subjects yet.</Text> : subjectProgress.map((subject) => <View key={subject._id} style={styles.subjectProgressRow}><View style={styles.subjectLine}><Text style={styles.structureName}>{subject.name}</Text><Text style={styles.chartValue}>{subject.percent}%</Text></View><AnimatedBar percent={subject.percent} color={subject.color || "#11806b"} /></View>)}</View>
      <TaskActivityChart days={taskDays} maxCount={maxTaskCount} />
    </>}
  </View>;
}

function SettingsPanel({ auth }) {
  const [name, setName] = useState(auth.user?.name || "");
  const [email, setEmail] = useState(auth.user?.email || "");
  const [permission, setPermission] = useState("Checking...");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(`${PROFILE_PICTURE_KEY}_${auth.user?.id || auth.user?._id || "current"}`).then(setProfilePicture).catch(() => {});
    Notifications.getPermissionsAsync().then((result) => setPermission(result.granted ? "Enabled" : "Not enabled")).catch(() => setPermission("Unavailable"));
  }, [auth.user]);

  async function chooseProfilePicture() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return setError("Photo library permission is required.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    setProfilePicture(uri);
    await AsyncStorage.setItem(`${PROFILE_PICTURE_KEY}_${auth.user?.id || auth.user?._id || "current"}`, uri);
  }

  async function requestNotifications() {
    const result = await Notifications.requestPermissionsAsync();
    setPermission(result.granted ? "Enabled" : "Not enabled");
  }

  async function saveProfile() {
    setError("");
    setMessage("");
    if (!name.trim() || !email.trim()) return setError("Name and email are required.");
    setBusy(true);
    try {
      const data = await apiRequest("/auth/profile", { method: "PATCH", body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }) }, auth.token);
      setName(data.user.name);
      setEmail(data.user.email);
      setMessage("Profile saved successfully.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <View>
    <View style={styles.placeholderCard}><Text style={styles.sectionTitle}>Profile</Text><View style={{ alignItems: "center", marginBottom: 14 }}>{profilePicture ? <Image source={{ uri: profilePicture }} style={{ width: 76, height: 76, borderRadius: 38 }} /> : <View style={{ alignItems: "center", justifyContent: "center", width: 76, height: 76, borderRadius: 38, backgroundColor: "#dff2e9" }}><Text style={{ color: "#087b82", fontSize: 22, fontWeight: "800" }}>{(name || "S").slice(0, 2).toUpperCase()}</Text></View>}<Pressable onPress={chooseProfilePicture} style={{ marginTop: 8 }}><Text style={styles.refreshText}>{profilePicture ? "Change profile picture" : "Add profile picture"}</Text></Pressable></View><Text style={styles.label}>Name</Text><TextInput value={name} onChangeText={setName} style={styles.input} /><Text style={styles.label}>Email</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />{error ? <Text style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.successText}>{message}</Text> : null}<View style={styles.focusActions}><Button disabled={busy} title={busy ? "Saving..." : "Save profile"} onPress={saveProfile} /></View></View>
    <View style={styles.placeholderCard}><Text style={styles.sectionTitle}>Notifications</Text><Text style={styles.mutedText}>Local task reminders: {permission}</Text><View style={styles.focusActions}><Button title={permission === "Enabled" ? "Permission enabled" : "Enable notifications"} onPress={requestNotifications} /></View></View>
    <View style={styles.placeholderCard}><Text style={styles.sectionTitle}>Offline data</Text><Text style={styles.mutedText}>Tasks and notes can be cached locally on this device. Task changes sync when Internet returns; notes remain device-only.</Text><Text style={styles.mutedText}>StudyFlow Mobile v1.0.0</Text></View>
  </View>;
}

function AuthScreen({ mode, setMode, onAuthenticated }) {
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (isSignup && !name.trim()) return setError("Name is required.");
    if (!email.trim() || !password) return setError("Email and password are required.");
    setBusy(true);
    try {
      const data = await apiRequest(`/auth/${isSignup ? "signup" : "login"}`, { method: "POST", body: JSON.stringify({ ...(isSignup ? { name: name.trim() } : {}), email: email.trim().toLowerCase(), password }) });
      await AsyncStorage.multiSet([[TOKEN_KEY, data.token], [USER_KEY, JSON.stringify(data.user)]]);
      onAuthenticated({ token: data.token, user: data.user });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView contentContainerStyle={[styles.authContainer, { backgroundColor: "#e5f6f5" }]} keyboardShouldPersistTaps="handled">
    <View style={[styles.brandMark, { backgroundColor: "#c9f3ec", borderRadius: 28 }]}><Text style={[styles.brandMarkText, { color: "#087b82" }]}>S</Text></View>
    <Text style={[styles.brand, { color: "#123d46" }]}>StudyFlow</Text>
    <Text style={[styles.subtitle, { color: "#66818a" }]}>{isSignup ? "Build a better study routine." : "Welcome back, student."}</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>{isSignup ? "Create your account" : "Sign in"}</Text>
      <Text style={styles.cardSubtitle}>{isSignup ? "Start organizing your study goals." : "Continue your study journey."}</Text>
      {isSignup && <Field label="Name" value={name} onChangeText={setName} />}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button disabled={busy} title={busy ? "Please wait..." : isSignup ? "Create account" : "Sign in"} onPress={submit} />
      <Pressable onPress={() => { setError(""); setMode(isSignup ? "login" : "signup"); }} style={styles.switchButton}><Text style={styles.switchText}>{isSignup ? "Already have an account? Sign in" : "New to StudyFlow? Create an account"}</Text></Pressable>
    </View>
    <Text style={styles.apiHint}>API: {getApiBaseUrl() || "not configured"}</Text>
  </ScrollView></KeyboardAvoidingView>;
}

function HomeScreen({ auth, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [activeView, setActiveView] = useState("home");
  const [profilePicture, setProfilePicture] = useState(null);

  async function loadTasks() {
    setError("");
    setLoadingTasks(true);
    try {
      const data = await apiRequest("/tasks", {}, auth.token);
      setTasks(data.tasks || []);
      await saveTaskCache(auth.user?.id || auth.user?._id, data.tasks || []);
      await flushSyncQueue();
      const refreshed = await apiRequest("/tasks", {}, auth.token);
      setTasks(refreshed.tasks || []);
      await saveTaskCache(auth.user?.id || auth.user?._id, refreshed.tasks || []);
    } catch (requestError) {
      const cached = await loadTaskCache(auth.user?.id || auth.user?._id);
      setTasks(cached);
      setError(cached.length ? "Offline mode: showing saved tasks." : requestError.message);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function flushSyncQueue() {
    const userId = auth.user?.id || auth.user?._id;
    const queue = await readSyncQueue(userId);
    if (!queue.length) return;
    const remaining = [];
    const idMap = {};
    for (const operation of queue) {
      try {
        if (operation.type === "createTask") {
          const data = await apiRequest("/tasks", { method: "POST", body: JSON.stringify({ title: operation.task.title, priority: operation.task.priority, estimatedMinutes: operation.task.estimatedMinutes, dueDate: operation.task.dueDate, reminderMinutesBefore: operation.task.reminderMinutesBefore }) }, auth.token);
          if (operation.task._id && data.task?._id) idMap[operation.task._id] = data.task._id;
          if (operation.task._id) await cancelTaskNotification(operation.task._id);
          await scheduleTaskNotification(data.task).catch(() => {});
        }
        if (operation.type === "updateTask") await apiRequest(`/tasks/${idMap[operation.id] || operation.id}`, { method: "PATCH", body: JSON.stringify(operation.patch) }, auth.token);
        if (operation.type === "deleteTask") await apiRequest(`/tasks/${idMap[operation.id] || operation.id}`, { method: "DELETE" }, auth.token);
      } catch { remaining.push(operation); }
    }
    await writeSyncQueue(userId, remaining);
  }

  useEffect(() => { loadTasks(); AsyncStorage.getItem(`${PROFILE_PICTURE_KEY}_${auth.user?.id || auth.user?._id || "current"}`).then(setProfilePicture).catch(() => {}); }, []);

  async function chooseHomeProfilePicture() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setError("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    setProfilePicture(uri);
    await AsyncStorage.setItem(`${PROFILE_PICTURE_KEY}_${auth.user?.id || auth.user?._id || "current"}`, uri);
  }

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") loadTasks(); });
    return () => subscription.remove();
  }, []);

  async function toggleTask(task) {
    const nextCompleted = !task.completed;
    const nextTasks = tasks.map((item) => item._id === task._id ? { ...item, completed: nextCompleted } : item);
    setTasks(nextTasks);
    try {
      const data = await apiRequest(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ completed: nextCompleted }) }, auth.token);
      setTasks((current) => current.map((item) => item._id === task._id ? data.task : item));
    } catch (requestError) {
      await enqueueSync(auth.user?.id || auth.user?._id, { type: "updateTask", id: task._id, patch: { completed: nextCompleted } });
      await saveTaskCache(auth.user?.id || auth.user?._id, nextTasks);
      setError("Offline: task change saved and will sync when you reconnect.");
    }
  }

  function handleSaved(savedTask) {
    setTasks((current) => {
      const exists = current.some((item) => item._id === savedTask._id);
      return exists ? current.map((item) => item._id === savedTask._id ? savedTask : item) : [savedTask, ...current];
    });
    saveTaskCache(auth.user?.id || auth.user?._id, tasks.some((item) => item._id === savedTask._id) ? tasks.map((item) => item._id === savedTask._id ? savedTask : item) : [savedTask, ...tasks]).catch(() => {});
    setShowForm(false);
    setEditingTask(null);
    scheduleTaskNotification(savedTask).catch(() => {});
  }

  function deleteTask(task) {
    Alert.alert("Delete task", `Delete \"${task.title}\"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await apiRequest(`/tasks/${task._id}`, { method: "DELETE" }, auth.token);
          await cancelTaskNotification(task._id);
          setTasks((current) => current.filter((item) => item._id !== task._id));
          await saveTaskCache(auth.user?.id || auth.user?._id, tasks.filter((item) => item._id !== task._id));
        } catch (requestError) {
          await enqueueSync(auth.user?.id || auth.user?._id, { type: "deleteTask", id: task._id });
          await cancelTaskNotification(task._id);
          setTasks((current) => current.filter((item) => item._id !== task._id));
          setError("Offline: task deletion saved and will sync when you reconnect.");
        }
      } },
    ]);
  }

  const viewTitle = activeView === "today" ? "Home" : activeView === "today-detail" ? "Today" : activeView.charAt(0).toUpperCase() + activeView.slice(1);
  const showTasks = activeView === "tasks";
  const showStructure = activeView === "goals" || activeView === "subjects";
  const showFocus = activeView === "focus";

  return <SafeAreaView style={[styles.screen, { backgroundColor: "#f2f7f6" }]} edges={["top", "left", "right", "bottom"]}>
    <View style={[styles.homeHeader, { display: activeView === "home" ? "none" : "flex", backgroundColor: "#f2f7f6", borderBottomWidth: 0, paddingBottom: 8 }]}><View><Text style={styles.smallEyebrow}>STUDYFLOW</Text><Text style={styles.homeTitle}>{viewTitle}</Text></View><Pressable onPress={onLogout} style={[styles.logoutButton, { backgroundColor: "#ffffff" }]}><Text style={styles.logoutText}>Log out</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.homeContent}>
      {activeView === "today" ? <><Text style={styles.greeting}>Hi, {auth.user?.name || "student"} 👋</Text><Text style={styles.homeSubtitle}>Let’s make today count.</Text><HomeFocusCard tasks={tasks} onOpenFocus={() => setActiveView("focus")} /><View style={{ marginTop: 20, borderRadius: 18, padding: 17, backgroundColor: "#10a889" }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ color: "#d9fff7", fontSize: 12 }}>Your learning health</Text><Text style={{ marginTop: 4, color: "#fff", fontSize: 24, fontWeight: "800" }}>{tasks.length ? (tasks.filter((task) => task.completed).length / tasks.length * 100).toFixed(0) >= 80 ? "Excellent" : "Keep going" : "Start your first task"}</Text><Text style={{ marginTop: 3, color: "#d9fff7", fontSize: 11 }}>Keep your study streak going</Text></View><Text style={{ color: "#fff", fontSize: 30, fontWeight: "800" }}>{tasks.length ? Math.round((tasks.filter((task) => task.completed).length / tasks.length) * 100) : 0}%</Text></View></View><Text style={[styles.sectionTitle, { marginTop: 22 }]}>Quick actions</Text><View style={{ flexDirection: "row", gap: 9, marginTop: 10 }}><Pressable onPress={() => { setEditingTask(null); setShowForm(true); }} style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#087b82", fontSize: 20 }}>＋</Text><Text style={{ marginTop: 3, color: "#123d46", fontSize: 11, fontWeight: "700" }}>Task</Text></Pressable><Pressable onPress={() => setActiveView("focus")} style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#5874ca", fontSize: 20 }}>◷</Text><Text style={{ marginTop: 3, color: "#123d46", fontSize: 11, fontWeight: "700" }}>Focus</Text></Pressable><Pressable onPress={() => setActiveView("planner")} style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#d88d2c", fontSize: 20 }}>▤</Text><Text style={{ marginTop: 3, color: "#123d46", fontSize: 11, fontWeight: "700" }}>Planner</Text></Pressable><Pressable onPress={() => setActiveView("insights")} style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#11a889", fontSize: 20 }}>▥</Text><Text style={{ marginTop: 3, color: "#123d46", fontSize: 11, fontWeight: "700" }}>Insights</Text></Pressable></View></> : null}
      {showTasks ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your tasks</Text><View style={styles.sectionActions}><Pressable onPress={loadTasks}><Text style={styles.refreshText}>Refresh</Text></Pressable><Pressable onPress={() => { setEditingTask(null); setShowForm(true); }} style={styles.addButton}><Text style={styles.addButtonText}>+ Add</Text></Pressable></View></View>
        {showForm ? <TaskForm task={editingTask} token={auth.token} userId={auth.user?.id || auth.user?._id} onCancel={() => { setShowForm(false); setEditingTask(null); }} onSaved={handleSaved} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loadingTasks ? <View style={styles.taskLoading}><ActivityIndicator color="#11806b" /><Text style={styles.loadingText}>Loading tasks...</Text></View> : null}
        {!loadingTasks && tasks.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No tasks yet</Text><Text style={styles.emptyText}>Your tasks will appear here once you create them.</Text></View> : null}
        {tasks.map((task) => <View key={task._id} style={styles.taskCard}><Pressable onPress={() => toggleTask(task)} style={styles.taskMain}><View style={[styles.checkbox, task.completed && styles.checkboxDone]}>{task.completed ? <Text style={styles.checkmark}>✓</Text> : null}</View><View style={styles.taskCopy}><Text style={[styles.taskTitle, task.completed && styles.taskCompleted]}>{task.title}</Text><Text style={styles.taskMeta}>{task.priority || "medium"}{task.estimatedMinutes ? ` • ${task.estimatedMinutes} min` : ""}{task.dueDate ? ` • Due ${new Date(task.dueDate).toLocaleString()}` : ""}</Text></View></Pressable><View style={styles.taskActions}><Pressable onPress={() => { setEditingTask(task); setShowForm(true); }}><Text style={styles.editText}>Edit</Text></Pressable><Pressable onPress={() => deleteTask(task)}><Text style={styles.deleteText}>Delete</Text></Pressable></View></View>)}</> : null}
      {activeView === "today" ? <><View style={{ marginTop: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={styles.sectionTitle}>Upcoming</Text><Pressable onPress={() => setActiveView("planner")}><Text style={styles.refreshText}>View all</Text></Pressable></View>{tasks.filter((task) => !task.completed && task.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 2).map((task) => <View key={"upcoming-" + task._id} style={{ marginTop: 10, borderRadius: 16, padding: 15, backgroundColor: "#e9e1ff", borderLeftWidth: 4, borderLeftColor: "#9b7ee8" }}><Text style={{ color: "#2d3150", fontSize: 14, fontWeight: "800" }}>{task.title}</Text><Text style={{ marginTop: 5, color: "#6f658b", fontSize: 11 }}>{new Date(task.dueDate).toLocaleString()} · {task.estimatedMinutes || 0} min</Text></View>)}<View style={{ marginTop: 22 }}><Text style={styles.sectionTitle}>This week</Text><View style={{ flexDirection: "row", gap: 9, marginTop: 10 }}><View style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#8d70d8", fontSize: 20, fontWeight: "800" }}>{tasks.reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0)}m</Text><Text style={{ marginTop: 3, color: "#6d7c76", fontSize: 10 }}>Planned time</Text></View><View style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#11a889", fontSize: 20, fontWeight: "800" }}>{tasks.filter((task) => task.completed).length}</Text><Text style={{ marginTop: 3, color: "#6d7c76", fontSize: 10 }}>Tasks done</Text></View><View style={{ flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#fff" }}><Text style={{ color: "#3e77c5", fontSize: 20, fontWeight: "800" }}>{tasks.filter((task) => task.dueDate).length}</Text><Text style={{ marginTop: 3, color: "#6d7c76", fontSize: 10 }}>Scheduled</Text></View></View></View></> : null}
      {activeView === "today" ? <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[["Today", "today-detail"], ["Task", "tasks"], ["Planner", "planner"], ["Goals", "goals"], ["Subjects", "subjects"], ["Focus", "focus"], ["Insights", "insights"]].map(([label, target]) => <Pressable key={label} onPress={() => setActiveView(target)} style={{ width: "23%", alignItems: "center", borderRadius: 13, paddingVertical: 11, backgroundColor: "#fff" }}><Text style={{ color: "#087b82", fontSize: 17 }}>◉</Text><Text style={{ marginTop: 3, color: "#123d46", fontSize: 9, fontWeight: "700" }}>{label}</Text></Pressable>)}</View> : null}
      {activeView === "home" ? <HomeDashboard auth={auth} tasks={tasks} profilePicture={profilePicture} onEditProfilePicture={chooseHomeProfilePicture} onNavigate={setActiveView} onAddTask={() => { setEditingTask(null); setActiveView("tasks"); setShowForm(true); }} /> : null}
      {activeView === "home" && showForm ? <TaskForm task={editingTask} token={auth.token} userId={auth.user?.id || auth.user?._id} onCancel={() => { setShowForm(false); setEditingTask(null); }} onSaved={handleSaved} /> : null}
      {showStructure ? <StudyStructure token={auth.token} mode={activeView} tasks={tasks} /> : null}
      {activeView === "today-detail" ? <><TodayPanel tasks={tasks} onAddTask={() => { setEditingTask(null); setShowForm(true); }} onOpenFocus={() => setActiveView("focus")} />{showForm ? <TaskForm task={editingTask} token={auth.token} userId={auth.user?.id || auth.user?._id} onCancel={() => { setShowForm(false); setEditingTask(null); }} onSaved={handleSaved} /> : null}</> : null}
      {showFocus ? <FocusPanel token={auth.token} tasks={tasks} isFocusPage={activeView === "focus"} onOpenFocus={() => setActiveView("focus")} /> : null}
      {activeView === "insights" ? <InsightsPanel token={auth.token} /> : null}
      {activeView === "planner" ? <PlannerPanel tasks={tasks} token={auth.token} userId={auth.user?.id || auth.user?._id} onSaved={handleSaved} /> : null}
      {activeView === "notes" ? <NotesPanel userId={auth.user?.id || auth.user?._id} /> : null}
      {activeView === "settings" ? <SettingsPanel auth={auth} /> : null}
    </ScrollView>
    <View style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: 10, paddingBottom: Platform.OS === "android" ? 14 : 18, minHeight: 74, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#d7e9e8" }}>{[{ key: "home", label: "Home", icon: "home-outline", color: "#087b82" }, { key: "planner", label: "Planner", icon: "calendar-outline", color: "#7657c7" }, { key: "today-detail", label: "Today", icon: "checkmark-circle-outline", color: "#e18a2a" }, { key: "insights", label: "Insights", icon: "bar-chart-outline", color: "#3d78c3" }, { key: "settings", label: "Profile", icon: "person-outline", color: "#db6c8f" }].map((item) => <Pressable key={item.key} onPress={() => setActiveView(item.key)} style={{ alignItems: "center", minWidth: 58 }}><Ionicons name={item.icon} size={25} color={activeView === item.key ? item.color : "#9ab0b5"} /><Text style={{ marginTop: 3, color: activeView === item.key ? item.color : "#8aa0a5", fontSize: 10, fontWeight: "800" }}>{item.label}</Text></Pressable>)}</View>
  </SafeAreaView>;
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("login");

  useEffect(() => {
    configureAlarmChannel();
    async function restoreSession() {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (!token) return;
        const cachedUser = JSON.parse((await AsyncStorage.getItem(USER_KEY)) || "null");
        try {
          const data = await apiRequest("/auth/me", {}, token);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setAuth({ token, user: data.user });
        } catch (requestError) {
          if (requestError.status === 401 || requestError.status === 403 || !cachedUser) throw requestError;
          setAuth({ token, user: cachedUser });
        }
      } catch {
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  async function logout() {
    try { if (auth?.token) await apiRequest("/auth/logout", { method: "POST" }, auth.token); } catch { /* local logout still works offline */ }
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setAuth(null);
    setMode("login");
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#11806b" size="large" /><Text style={styles.loadingText}>Loading StudyFlow...</Text></View>;
  return <SafeAreaProvider><View style={styles.flex}><StatusBar style={auth ? "dark" : "light"} />{auth ? <HomeScreen auth={auth} onLogout={logout} /> : <AuthScreen mode={mode} setMode={setMode} onAuthenticated={setAuth} />}</View></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f6f1" }, loadingText: { marginTop: 12, color: "#5e716a" },
  authContainer: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#102f2a" }, brandMark: { alignSelf: "center", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 16, backgroundColor: "#11806b" }, brandMarkText: { color: "#fff", fontSize: 34, fontWeight: "800" }, brand: { marginTop: 12, textAlign: "center", color: "#fff", fontSize: 30, fontWeight: "800" }, subtitle: { marginTop: 6, marginBottom: 26, textAlign: "center", color: "#c9d8d2", fontSize: 15 },
  card: { borderRadius: 20, padding: 22, backgroundColor: "#fff" }, heading: { color: "#17362f", fontSize: 24, fontWeight: "800" }, cardSubtitle: { marginTop: 6, marginBottom: 20, color: "#718078" }, fieldGroup: { marginBottom: 15 }, label: { marginBottom: 7, color: "#304d44", fontSize: 13, fontWeight: "700" }, input: { borderWidth: 1, borderColor: "#dfe3dc", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: "#17362f", fontSize: 16 }, button: { alignItems: "center", borderRadius: 12, paddingVertical: 14, backgroundColor: "#11806b" }, buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" }, disabledButton: { opacity: 0.6 }, pressedButton: { opacity: 0.8 }, error: { marginBottom: 12, color: "#b42318", lineHeight: 20 }, switchButton: { alignItems: "center", marginTop: 18 }, switchText: { color: "#11806b", fontWeight: "700" }, apiHint: { marginTop: 18, textAlign: "center", color: "#a9bbb3", fontSize: 11 },
  screen: { flex: 1, backgroundColor: "#f5f6f1" }, homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#dfe3dc" }, smallEyebrow: { color: "#11806b", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, homeTitle: { marginTop: 3, color: "#17362f", fontSize: 28, fontWeight: "800" }, logoutButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#eef8f3" }, logoutText: { color: "#11806b", fontWeight: "700" }, navBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#dfe3dc" }, navItem: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#f1f4f1" }, navItemActive: { backgroundColor: "#dff2e9" }, navItemText: { color: "#687870", fontSize: 12, fontWeight: "700", textTransform: "capitalize" }, navItemTextActive: { color: "#11806b" }, homeContent: { padding: 22, paddingBottom: 36 }, greeting: { color: "#17362f", fontSize: 24, fontWeight: "800" }, homeSubtitle: { marginTop: 8, color: "#6d7c76", fontSize: 15 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 }, sectionTitle: { color: "#17362f", fontSize: 19, fontWeight: "800" }, sectionActions: { flexDirection: "row", alignItems: "center", gap: 16 }, refreshText: { color: "#11806b", fontWeight: "700" }, addButton: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#11806b" }, addButtonText: { color: "#fff", fontWeight: "800" }, taskLoading: { alignItems: "center", padding: 24 }, taskCard: { flexDirection: "row", alignItems: "center", marginBottom: 10, borderRadius: 16, padding: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, taskMain: { flex: 1, flexDirection: "row", alignItems: "center" }, checkbox: { alignItems: "center", justifyContent: "center", width: 27, height: 27, marginRight: 12, borderRadius: 8, borderWidth: 1.5, borderColor: "#b9c8c0" }, checkboxDone: { borderColor: "#11806b", backgroundColor: "#11806b" }, checkmark: { color: "#fff", fontSize: 18, fontWeight: "800" }, taskCopy: { flex: 1 }, taskTitle: { color: "#17362f", fontSize: 15, fontWeight: "700" }, taskCompleted: { color: "#8a9992", textDecorationLine: "line-through" }, taskMeta: { marginTop: 5, color: "#7b8a83", fontSize: 12 }, taskActions: { flexDirection: "row", gap: 12, marginLeft: 8 }, editText: { color: "#11806b", fontSize: 12, fontWeight: "800" }, deleteText: { color: "#b42318", fontSize: 12, fontWeight: "800" }, emptyCard: { marginTop: 8, borderRadius: 18, padding: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, emptyTitle: { color: "#17362f", fontSize: 18, fontWeight: "800" }, emptyText: { marginTop: 8, color: "#6d7c76", lineHeight: 21 }, formCard: { marginBottom: 18, borderRadius: 18, padding: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }, formTitle: { color: "#17362f", fontSize: 20, fontWeight: "800" }, closeText: { color: "#6d7c76" }, priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 }, priorityButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10, backgroundColor: "#f1f4f1" }, reminderButton: { minWidth: 62, alignItems: "center", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: "#f1f4f1" }, priorityButtonActive: { backgroundColor: "#dff2e9" }, priorityText: { color: "#62736b", fontWeight: "700", textTransform: "capitalize" }, priorityTextActive: { color: "#11806b" }, structureBlock: { marginTop: 8, borderRadius: 18, padding: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, inlineForm: { gap: 10, marginBottom: 12 }, structureRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#eef1ed" }, structureName: { flex: 1, color: "#17362f", fontWeight: "700" }, mutedText: { color: "#7b8a83", fontSize: 13 }, colorDot: { width: 10, height: 10, marginRight: 10, borderRadius: 5 }, goalDot: { width: 25, marginRight: 4 }, goalDotText: { color: "#11806b", fontSize: 20 }, goalCopy: { flex: 1 }, focusCard: { marginTop: 16, borderRadius: 18, padding: 18, backgroundColor: "#102f2a" }, focusTime: { color: "#fff", fontSize: 20, fontWeight: "800" }, focusActions: { marginTop: 14 }, successText: { marginTop: 10, color: "#d9f5e7", fontWeight: "700" }, placeholderCard: { marginTop: 16, gap: 12, borderRadius: 18, padding: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, notesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, noteEditor: { marginTop: 12, marginBottom: 18, borderRadius: 18, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, noteTitleInput: { color: "#17362f", fontSize: 18, fontWeight: "800", paddingVertical: 8 }, noteBodyInput: { minHeight: 130, marginTop: 8, color: "#40554e", fontSize: 15, lineHeight: 22 }, noteEditorActions: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 12 }, noteCard: { marginBottom: 12, borderRadius: 16, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, noteCardTitle: { color: "#17362f", fontSize: 17, fontWeight: "800" }, noteCardBody: { marginTop: 8, color: "#40554e", lineHeight: 21 }, noteDate: { marginTop: 10, color: "#91a09a", fontSize: 11 }, noteActions: { flexDirection: "row", gap: 16, marginTop: 12 }, plannerIntro: { marginBottom: 16, color: "#6d7c76", fontSize: 15, lineHeight: 21 }, dayRow: { gap: 8, paddingBottom: 14 }, dayCard: { minWidth: 78, alignItems: "center", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, dayCardActive: { backgroundColor: "#11806b", borderColor: "#11806b" }, dayLabel: { color: "#6d7c76", fontSize: 12, fontWeight: "700" }, dayDate: { marginTop: 4, color: "#17362f", fontSize: 13, fontWeight: "800" }, dayTextActive: { color: "#fff" }, plannerSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, borderRadius: 16, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, summaryValue: { marginTop: 3, color: "#17362f", fontSize: 18, fontWeight: "800" }, plannerTask: { flexDirection: "row", alignItems: "center", marginBottom: 10, borderRadius: 16, padding: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, periodRow: { flexDirection: "row", gap: 8, marginBottom: 16 }, periodButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 11, backgroundColor: "#f1f4f1" }, periodButtonActive: { backgroundColor: "#dff2e9" }, periodText: { color: "#687870", fontWeight: "700" }, periodTextActive: { color: "#11806b" }, statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, statCard: { width: "48%", borderRadius: 16, padding: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, statValue: { marginTop: 6, color: "#17362f", fontSize: 24, fontWeight: "800" }, chartCard: { marginTop: 16, borderRadius: 18, padding: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, chartRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 13 }, chartLabel: { width: 40, color: "#7b8a83", fontSize: 11 }, chartTrack: { flex: 1, height: 8, overflow: "hidden", borderRadius: 8, backgroundColor: "#edf1ed" }, chartBar: { height: "100%", borderRadius: 8, backgroundColor: "#11806b" }, chartValue: { width: 34, color: "#687870", fontSize: 11, textAlign: "right" }, subjectProgressRow: { marginTop: 14 }, subjectLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
