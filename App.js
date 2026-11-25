import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { apiRequest, getApiBaseUrl } from "./src/api";

const TOKEN_KEY = "studyflow_token";
const USER_KEY = "studyflow_user";

function Button({ title, onPress, disabled = false }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabledButton, pressed && !disabled && styles.pressedButton]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}

function Field({ label, secureTextEntry, value, onChangeText, keyboardType }) {
  return <View style={styles.fieldGroup}><Text style={styles.label}>{label}</Text><TextInput autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"} autoCorrect={false} keyboardType={keyboardType} onChangeText={onChangeText} placeholder={label} placeholderTextColor="#91a09a" secureTextEntry={secureTextEntry} style={styles.input} value={value} /></View>;
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

function HomeScreen({ user, onLogout }) {
  return <SafeAreaView style={styles.screen}><View style={styles.homeHeader}><View><Text style={styles.smallEyebrow}>STUDYFLOW</Text><Text style={styles.homeTitle}>Today</Text></View><Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>Log out</Text></Pressable></View><View style={styles.homeContent}><Text style={styles.greeting}>Hi, {user?.name || "student"} 👋</Text><Text style={styles.homeSubtitle}>Your mobile study workspace is ready.</Text><View style={styles.emptyCard}><Text style={styles.emptyTitle}>Next up</Text><Text style={styles.emptyText}>Tasks and planner views will be added next.</Text></View></View></SafeAreaView>;
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
        const data = await apiRequest("/auth/me", {}, token);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setAuth({ token, user: data.user });
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
  return <View style={styles.flex}><StatusBar style={auth ? "dark" : "light"} />{auth ? <HomeScreen user={auth.user} onLogout={logout} /> : <AuthScreen mode={mode} setMode={setMode} onAuthenticated={setAuth} />}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f6f1" }, loadingText: { marginTop: 12, color: "#5e716a" },
  authContainer: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#102f2a" }, brandMark: { alignSelf: "center", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 16, backgroundColor: "#11806b" }, brandMarkText: { color: "#fff", fontSize: 34, fontWeight: "800" }, brand: { marginTop: 12, textAlign: "center", color: "#fff", fontSize: 30, fontWeight: "800" }, subtitle: { marginTop: 6, marginBottom: 26, textAlign: "center", color: "#c9d8d2", fontSize: 15 },
  card: { borderRadius: 20, padding: 22, backgroundColor: "#fff" }, heading: { color: "#17362f", fontSize: 24, fontWeight: "800" }, cardSubtitle: { marginTop: 6, marginBottom: 20, color: "#718078" }, fieldGroup: { marginBottom: 15 }, label: { marginBottom: 7, color: "#304d44", fontSize: 13, fontWeight: "700" }, input: { borderWidth: 1, borderColor: "#dfe3dc", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: "#17362f", fontSize: 16 }, button: { alignItems: "center", borderRadius: 12, paddingVertical: 14, backgroundColor: "#11806b" }, buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" }, disabledButton: { opacity: 0.6 }, pressedButton: { opacity: 0.8 }, error: { marginBottom: 12, color: "#b42318", lineHeight: 20 }, switchButton: { alignItems: "center", marginTop: 18 }, switchText: { color: "#11806b", fontWeight: "700" }, apiHint: { marginTop: 18, textAlign: "center", color: "#a9bbb3", fontSize: 11 },
  screen: { flex: 1, backgroundColor: "#f5f6f1" }, homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#dfe3dc" }, smallEyebrow: { color: "#11806b", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, homeTitle: { marginTop: 3, color: "#17362f", fontSize: 28, fontWeight: "800" }, logoutButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#eef8f3" }, logoutText: { color: "#11806b", fontWeight: "700" }, homeContent: { padding: 22 }, greeting: { color: "#17362f", fontSize: 24, fontWeight: "800" }, homeSubtitle: { marginTop: 8, color: "#6d7c76", fontSize: 15 }, emptyCard: { marginTop: 24, borderRadius: 18, padding: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe3dc" }, emptyTitle: { color: "#17362f", fontSize: 18, fontWeight: "800" }, emptyText: { marginTop: 8, color: "#6d7c76", lineHeight: 21 },
});
