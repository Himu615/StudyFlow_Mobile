import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { apiRequest, getApiBaseUrl } from "./src/api";
import { enqueueSync, loadTaskCache, readSyncQueue, saveTaskCache, writeSyncQueue } from "./src/offline";

const TOKEN_KEY = "studyflow_token";
const USER_KEY = "studyflow_user";
const NOTIFICATION_KEY = "studyflow_task_notifications";
const NAV_ITEMS = ["today", "tasks", "planner", "goals", "subjects", "focus", "notes", "settings"];

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function scheduleTaskNotification(task) {
  const notificationMap = JSON.parse((await AsyncStorage.getItem(NOTIFICATION_KEY)) || "{}");
  if (task?._id && notificationMap[task._id]) {
    await Notifications.cancelScheduledNotificationAsync(notificationMap[task._id]).catch(() => {});
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
  const identifier = await Notifications.scheduleNotificationAsync({
    content: { title: reminderMinutes ? "StudyFlow task reminder" : "StudyFlow task due", body: task.title, data: { taskId: task._id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notificationDate },
  });
  notificationMap[task._id] = identifier;
  await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notificationMap));
}

async function cancelTaskNotification(taskId) {
  const notificationMap = JSON.parse((await AsyncStorage.getItem(NOTIFICATION_KEY)) || "{}");
  if (!notificationMap[taskId]) return;
  await Notifications.cancelScheduledNotificationAsync(notificationMap[taskId]).catch(() => {});
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

function TaskForm({ task, token, onCancel, onSaved }) {
  const [title, setTitle] = useState(task?.title || "");
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [minutes, setMinutes] = useState(String(task?.estimatedMinutes || 25));
  const [dueDate, setDueDate] = useState(localDateTimeInput(task?.dueDate));
  const [reminder, setReminder] = useState(task?.reminderMinutesBefore ? String(task.reminderMinutesBefore) : "");
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
    <View style={styles.fieldGroup}><Text style={styles.label}>Due date and time</Text><TextInput autoCapitalize="none" placeholder="YYYY-MM-DDTHH:MM" placeholderTextColor="#91a09a" onChangeText={setDueDate} style={styles.input} value={dueDate} /></View>
    <Text style={styles.label}>Reminder</Text>
    <View style={styles.priorityRow}>{[["", "None"], ["5", "5 min"], ["15", "15 min"], ["30", "30 min"], ["60", "1 hour"], ["1440", "1 day"]].map(([value, label]) => <Pressable key={label} onPress={() => setReminder(value)} style={[styles.reminderButton, reminder === value && styles.priorityButtonActive]}><Text style={[styles.priorityText, reminder === value && styles.priorityTextActive]}>{label}</Text></Pressable>)}</View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Button disabled={busy} title={busy ? "Saving..." : task ? "Save changes" : "Add task"} onPress={submit} />
  </View>;
}

function StudyStructure({ token }) {
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

  return <View style={styles.structureBlock}>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Subjects</Text><Pressable onPress={() => setShowSubjectForm((value) => !value)}><Text style={styles.refreshText}>+ Add</Text></Pressable></View>
    {showSubjectForm ? <View style={styles.inlineForm}><TextInput onChangeText={setSubjectName} placeholder="Subject name" placeholderTextColor="#91a09a" style={styles.input} value={subjectName} /><Button title="Save subject" onPress={addSubject} /></View> : null}
    {subjects.length === 0 ? <Text style={styles.mutedText}>No subjects yet.</Text> : subjects.map((subject) => <View key={subject._id} style={styles.structureRow}><View style={[styles.colorDot, { backgroundColor: subject.color || "#11806b" }]} /><Text style={styles.structureName}>{subject.name}</Text><Pressable onPress={() => removeItem("subject", subject)}><Text style={styles.deleteText}>Delete</Text></Pressable></View>)}
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Goals</Text><Pressable onPress={() => setShowGoalForm((value) => !value)}><Text style={styles.refreshText}>+ Add</Text></Pressable></View>
    {showGoalForm ? <View style={styles.inlineForm}><TextInput onChangeText={setGoalTitle} placeholder="Goal title" placeholderTextColor="#91a09a" style={styles.input} value={goalTitle} /><Button title="Save goal" onPress={addGoal} /></View> : null}
    {goals.length === 0 ? <Text style={styles.mutedText}>No goals yet.</Text> : goals.map((goal) => <View key={goal._id} style={styles.structureRow}><View style={styles.goalDot}><Text style={styles.goalDotText}>◎</Text></View><View style={styles.goalCopy}><Text style={styles.structureName}>{goal.title}</Text><Text style={styles.taskMeta}>{Number(goal.progress) || 0}% complete</Text></View><Pressable onPress={() => removeItem("goal", goal)}><Text style={styles.deleteText}>Delete</Text></Pressable></View>)}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

function FocusPanel({ token }) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [message, setMessage] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  function start() {
    const startTime = new Date();
    setStartedAt(startTime);
    setSeconds(0);
    setMessage("");
    setRunning(true);
    intervalRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000)), 1000);
  }

  async function stop() {
    clearInterval(intervalRef.current);
    setRunning(false);
    const endedAt = new Date();
    const elapsedSeconds = startedAt ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)) : seconds;
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    try {
      await apiRequest("/study/sessions", { method: "POST", body: JSON.stringify({ startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), durationMinutes }) }, token);
      setMessage(`Saved ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"} study session.`);
    } catch (requestError) {
      setMessage(requestError.message);
    }
    setSeconds(0);
    setStartedAt(null);
  }

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return <View style={styles.focusCard}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Focus session</Text><Text style={styles.focusTime}>{minutes}:{remainingSeconds}</Text></View><Text style={styles.mutedText}>Start a focus timer and save the session to your study history.</Text><View style={styles.focusActions}>{running ? <Button title="Stop and save" onPress={stop} /> : <Button title="Start focus" onPress={start} />}</View>{message ? <Text style={styles.successText}>{message}</Text> : null}</View>;
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

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
    <View style={styles.brandMark}><Text style={styles.brandMarkText}>S</Text></View>
    <Text style={styles.brand}>StudyFlow</Text>
    <Text style={styles.subtitle}>{isSignup ? "Build a better study routine." : "Welcome back, student."}</Text>
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
  const [activeView, setActiveView] = useState("today");

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
    for (const operation of queue) {
      try {
        if (operation.type === "updateTask") await apiRequest(`/tasks/${operation.id}`, { method: "PATCH", body: JSON.stringify(operation.patch) }, auth.token);
        if (operation.type === "deleteTask") await apiRequest(`/tasks/${operation.id}`, { method: "DELETE" }, auth.token);
      } catch { remaining.push(operation); }
    }
    await writeSyncQueue(userId, remaining);
  }

  useEffect(() => { loadTasks(); }, []);

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

  const viewTitle = activeView.charAt(0).toUpperCase() + activeView.slice(1);
  const showTasks = activeView === "today" || activeView === "tasks";
  const showStructure = activeView === "today" || activeView === "goals" || activeView === "subjects";
  const showFocus = activeView === "today" || activeView === "focus";

  return <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
    <View style={styles.homeHeader}><View><Text style={styles.smallEyebrow}>STUDYFLOW</Text><Text style={styles.homeTitle}>{viewTitle}</Text></View><Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>Log out</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navBar}>
      {NAV_ITEMS.map((item) => <Pressable key={item} onPress={() => setActiveView(item)} style={[styles.navItem, activeView === item && styles.navItemActive]}><Text style={[styles.navItemText, activeView === item && styles.navItemTextActive]}>{item}</Text></Pressable>)}
    </ScrollView>
    <ScrollView contentContainerStyle={styles.homeContent}>
      {activeView === "today" ? <><Text style={styles.greeting}>Hi, {auth.user?.name || "student"} 👋</Text><Text style={styles.homeSubtitle}>Keep moving forward with one task at a time.</Text></> : null}
      {showTasks ? <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your tasks</Text><View style={styles.sectionActions}><Pressable onPress={loadTasks}><Text style={styles.refreshText}>Refresh</Text></Pressable><Pressable onPress={() => { setEditingTask(null); setShowForm(true); }} style={styles.addButton}><Text style={styles.addButtonText}>+ Add</Text></Pressable></View></View>
        {showForm ? <TaskForm task={editingTask} token={auth.token} onCancel={() => { setShowForm(false); setEditingTask(null); }} onSaved={handleSaved} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loadingTasks ? <View style={styles.taskLoading}><ActivityIndicator color="#11806b" /><Text style={styles.loadingText}>Loading tasks...</Text></View> : null}
        {!loadingTasks && tasks.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No tasks yet</Text><Text style={styles.emptyText}>Your tasks will appear here once you create them.</Text></View> : null}
        {tasks.map((task) => <View key={task._id} style={styles.taskCard}><Pressable onPress={() => toggleTask(task)} style={styles.taskMain}><View style={[styles.checkbox, task.completed && styles.checkboxDone]}>{task.completed ? <Text style={styles.checkmark}>✓</Text> : null}</View><View style={styles.taskCopy}><Text style={[styles.taskTitle, task.completed && styles.taskCompleted]}>{task.title}</Text><Text style={styles.taskMeta}>{task.priority || "medium"}{task.estimatedMinutes ? ` • ${task.estimatedMinutes} min` : ""}{task.dueDate ? ` • Due ${new Date(task.dueDate).toLocaleString()}` : ""}</Text></View></Pressable><View style={styles.taskActions}><Pressable onPress={() => { setEditingTask(task); setShowForm(true); }}><Text style={styles.editText}>Edit</Text></Pressable><Pressable onPress={() => deleteTask(task)}><Text style={styles.deleteText}>Delete</Text></Pressable></View></View>)}</> : null}
      {showStructure ? <StudyStructure token={auth.token} /> : null}
      {showFocus ? <FocusPanel token={auth.token} /> : null}
      {activeView === "planner" ? <View style={styles.placeholderCard}><Text style={styles.sectionTitle}>Planner</Text><Text style={styles.mutedText}>Plan tasks by date. The full calendar view is next.</Text></View> : null}
      {activeView === "notes" ? <NotesPanel userId={auth.user?.id || auth.user?._id} /> : null}
      {activeView === "settings" ? <View style={styles.placeholderCard}><Text style={styles.sectionTitle}>Settings</Text><Text style={styles.mutedText}>Account: {auth.user?.email || "signed in"}</Text></View> : null}
    </ScrollView>
  </SafeAreaView>;
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("login");

  useEffect(() => {
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
  screen: { flex: 1, backgroundColor: "#f5f6f1" }, homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#dfe3dc" }, smallEyebrow: { color: "#11806b", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, homeTitle: { marginTop: 3, color: "#17362f", fontSize: 28, fontWeight: "800" }, logoutButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#eef8f3" }, logoutText: { color: "#11806b", fontWeight: "700" }, navBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#dfe3dc" }, navItem: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#f1f4f1" }, navItemActive: { backgroundColor: "#dff2e9" }, navItemText: { color: "#687870", fontSize: 12, fontWeight: "700", textTransform: "capitalize" }, navItemTextActive: { color: "#11806b" }, homeContent: { padding: 22, paddingBottom: 36 }, greeting: { color: "#17362f", fontSize: 24, fontWeight: "800" }, homeSubtitle: { marginTop: 8, color: "#6d7c76", fontSize: 15 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 }, sectionTitle: { color: "#17362f", fontSize: 19, fontWeight: "800" }, sectionActions: { flexDirection: "row", alignItems: "center", gap: 16 }, refreshText: { color: "#11806b", fontWeight: "700" }, addButton: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#11806b" }, addButtonText: { color: "#fff", fontWeight: "800" }, taskLoading: { alignItems: "center", padding: 24 }, taskCard: { flexDirection: "row", alignItems: "center", marginBottom: 10, borderRadius: 16, padding: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, taskMain: { flex: 1, flexDirection: "row", alignItems: "center" }, checkbox: { alignItems: "center", justifyContent: "center", width: 27, height: 27, marginRight: 12, borderRadius: 8, borderWidth: 1.5, borderColor: "#b9c8c0" }, checkboxDone: { borderColor: "#11806b", backgroundColor: "#11806b" }, checkmark: { color: "#fff", fontSize: 18, fontWeight: "800" }, taskCopy: { flex: 1 }, taskTitle: { color: "#17362f", fontSize: 15, fontWeight: "700" }, taskCompleted: { color: "#8a9992", textDecorationLine: "line-through" }, taskMeta: { marginTop: 5, color: "#7b8a83", fontSize: 12 }, taskActions: { flexDirection: "row", gap: 12, marginLeft: 8 }, editText: { color: "#11806b", fontSize: 12, fontWeight: "800" }, deleteText: { color: "#b42318", fontSize: 12, fontWeight: "800" }, emptyCard: { marginTop: 8, borderRadius: 18, padding: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, emptyTitle: { color: "#17362f", fontSize: 18, fontWeight: "800" }, emptyText: { marginTop: 8, color: "#6d7c76", lineHeight: 21 }, formCard: { marginBottom: 18, borderRadius: 18, padding: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }, formTitle: { color: "#17362f", fontSize: 20, fontWeight: "800" }, closeText: { color: "#6d7c76", fontWeight: "700" }, priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 }, priorityButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10, backgroundColor: "#f1f4f1" }, reminderButton: { minWidth: 62, alignItems: "center", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: "#f1f4f1" }, priorityButtonActive: { backgroundColor: "#dff2e9" }, priorityText: { color: "#62736b", fontWeight: "700", textTransform: "capitalize" }, priorityTextActive: { color: "#11806b" }, structureBlock: { marginTop: 8, borderRadius: 18, padding: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, inlineForm: { gap: 10, marginBottom: 12 }, structureRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#eef1ed" }, structureName: { flex: 1, color: "#17362f", fontWeight: "700" }, mutedText: { color: "#7b8a83", fontSize: 13 }, colorDot: { width: 10, height: 10, marginRight: 10, borderRadius: 5 }, goalDot: { width: 25, marginRight: 4 }, goalDotText: { color: "#11806b", fontSize: 20 }, goalCopy: { flex: 1 }, focusCard: { marginTop: 16, borderRadius: 18, padding: 18, backgroundColor: "#102f2a" }, focusTime: { color: "#fff", fontSize: 20, fontWeight: "800" }, focusActions: { marginTop: 14 }, successText: { marginTop: 10, color: "#d9f5e7", fontWeight: "700" }, placeholderCard: { marginTop: 16, gap: 12, borderRadius: 18, padding: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, notesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, noteEditor: { marginTop: 12, marginBottom: 18, borderRadius: 18, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, noteTitleInput: { color: "#17362f", fontSize: 18, fontWeight: "800", paddingVertical: 8 }, noteBodyInput: { minHeight: 130, marginTop: 8, color: "#40554e", fontSize: 15, lineHeight: 22 }, noteEditorActions: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 12 }, noteCard: { marginBottom: 12, borderRadius: 16, padding: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, noteCardTitle: { color: "#17362f", fontSize: 17, fontWeight: "800" }, noteCardBody: { marginTop: 8, color: "#40554e", lineHeight: 21 }, noteDate: { marginTop: 10, color: "#91a09a", fontSize: 11 }, noteActions: { flexDirection: "row", gap: 16, marginTop: 12 },
});
