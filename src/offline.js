import AsyncStorage from "@react-native-async-storage/async-storage";

const taskCacheKey = (userId) => `studyflow_tasks_${userId || "current"}`;
const queueKey = (userId) => `studyflow_sync_queue_${userId || "current"}`;

export async function saveTaskCache(userId, tasks) {
  await AsyncStorage.setItem(taskCacheKey(userId), JSON.stringify(tasks));
}

export async function loadTaskCache(userId) {
  const raw = await AsyncStorage.getItem(taskCacheKey(userId));
  return raw ? JSON.parse(raw) : [];
}

export async function enqueueSync(userId, operation) {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  const queue = raw ? JSON.parse(raw) : [];
  queue.push({ ...operation, queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

export async function readSyncQueue(userId) {
  const raw = await AsyncStorage.getItem(queueKey(userId));
  return raw ? JSON.parse(raw) : [];
}

export async function writeSyncQueue(userId, queue) {
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}
