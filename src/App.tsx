import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  MessageSquareText, 
  Sparkles, 
  Copy, 
  Trash2, 
  Loader2, 
  Info,
  ChevronRight,
  CheckCircle2,
  Briefcase,
  LayoutList,
  PlusCircle,
  Image as ImageIcon,
  X,
  Users,
  Mic,
  Square,
  MessageCircle,
  Send,
  UserPlus,
  UserMinus,
  History as HistoryIcon,
  LogOut,
  LogIn,
  ChevronDown,
  Calendar,
  FileDown,
  AlertTriangle,
  Search,
  FileText,
  Paperclip,
  Edit2,
  BarChart3,
  Megaphone,
  DollarSign,
  TrendingUp,
  Edit3
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { 
  summarizeChat, 
  transcribeAudio, 
  summarizeHistory, 
  generateGroupMessageFromHistory,
  generateAdCopy,
  type SummaryMode 
} from "./services/gemini";
import { cn } from "./lib/utils";
import { auth, db } from "./firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  type User
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  getDocFromServer,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-red-50">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-red-100 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto">
              <Info size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Ops! Algo deu errado.</h2>
            <p className="text-gray-600">Ocorreu um erro inesperado na aplicação.</p>
            <pre className="text-xs bg-gray-50 p-4 rounded-xl overflow-auto text-left max-h-40">
              {this.state.error?.message || JSON.stringify(this.state.error)}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition-all"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Client {
  id: string;
  name: string;
  niche?: string;
  logo?: string;
  platforms?: string[];
  investmentValue?: number;
  platformInvestments?: Record<string, number>;
  status?: 'active' | 'inactive';
  currency?: string;
  createdAt: any;
  uid: string;
}

interface HistoryRecord {
  id: string;
  clientId: string;
  mode: SummaryMode;
  content: string;
  createdAt: any;
  uid: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState("");
  const [tempProfilePic, setTempProfilePic] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isGenericMode, setIsGenericMode] = useState(false);
  const [clientHistories, setClientHistories] = useState<HistoryRecord[]>([]);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isClientsTabOpen, setIsClientsTabOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientNiche, setNewClientNiche] = useState("");
  const [newClientLogo, setNewClientLogo] = useState<string | null>(null);
  const [newClientPlatforms, setNewClientPlatforms] = useState<string[]>(["Google", "Meta"]);
  const [newClientInvestment, setNewClientInvestment] = useState<string>("");
  const [newClientPlatformInvestments, setNewClientPlatformInvestments] = useState<Record<string, string>>({});
  const [newClientStatus, setNewClientStatus] = useState<'active' | 'inactive'>('active');
  const [newClientCurrency, setNewClientCurrency] = useState("BRL");
  const [customPlatform, setCustomPlatform] = useState("");
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editingClientId, setEditingClientId] = useState("");
  const [editingClientName, setEditingClientName] = useState("");
  const [editingClientPlatformInvestments, setEditingClientPlatformInvestments] = useState<Record<string, string>>({});
  const [editingClientStatus, setEditingClientStatus] = useState<'active' | 'inactive'>('active');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [dashboardDateFilter, setDashboardDateFilter] = useState<DateFilterType>("current_month");
  const [dashboardClientFilter, setDashboardClientFilter] = useState<string | null>(null);
  const [dashboardCustomStart, setDashboardCustomStart] = useState<string>("");
  const [dashboardCustomEnd, setDashboardCustomEnd] = useState<string>("");
  const [niche, setNiche] = useState("");
  const [allHistories, setAllHistories] = useState<HistoryRecord[]>([]);
  const [historySummary, setHistorySummary] = useState<string | null>(null);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [isSummarizingHistory, setIsSummarizingHistory] = useState(false);
  const [isGeneratingGroupMessage, setIsGeneratingGroupMessage] = useState(false);
  const [viewAllCategories, setViewAllCategories] = useState<string[]>([]);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<HistoryRecord | null>(null);
  const [isHistoryDetailModalOpen, setIsHistoryDetailModalOpen] = useState(false);
  const [clientForHistoryModal, setClientForHistoryModal] = useState<Client | null>(null);
  const [isClientHistoryModalOpen, setIsClientHistoryModalOpen] = useState(false);
  const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<{ id: string; label: string; icon: any; color: string } | null>(null);
  const [isCategoryHistoryModalOpen, setIsCategoryHistoryModalOpen] = useState(false);
  const [expandedMetricsClientId, setExpandedMetricsClientId] = useState<string | null>(null);
  const [selectedSummaryModes, setSelectedSummaryModes] = useState<SummaryMode[]>(["communication", "account_actions", "group_update", "meeting_summary"]);
  const [isSummaryOptionsModalOpen, setIsSummaryOptionsModalOpen] = useState(false);
  const [summaryOption, setSummaryOption] = useState<"all" | "selected">("all");
  
  // Ad Copy Generator State
  const [adPlatform, setAdPlatform] = useState<"Google Ads" | "Meta Ads">("Google Ads");
  const [adLanguage, setAdLanguage] = useState("Português (Brasil)");
  const [adProductInfo, setAdProductInfo] = useState("");
  const [generatedAdCopy, setGeneratedAdCopy] = useState<string | null>(null);
  const [isGeneratingAdCopy, setIsGeneratingAdCopy] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: 'warning'
  });
  
  type DateFilterType = "all" | "today" | "yesterday" | "7days" | "30days" | "custom" | "specific" | "current_month";
  const [historyDateFilter, setHistoryDateFilter] = useState<DateFilterType>("all");
  const [specificDate, setSpecificDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  
  const selectedClient = clients.find(c => c.id === selectedClientId);
  
  // State for the filters that are currently active in the view
  const [appliedDateFilter, setAppliedDateFilter] = useState<{
    type: DateFilterType;
    specificDate: string;
    customStartDate: string;
    customEndDate: string;
  }>({
    type: "all",
    specificDate: new Date().toISOString().split('T')[0],
    customStartDate: "",
    customEndDate: ""
  });
  
  const [chatTexts, setChatTexts] = useState<Record<SummaryMode, string>>({
    communication: "",
    account_actions: "",
    group_update: "",
    client_response: "",
    meeting_summary: "",
    sales_analyzer: "",
    ad_copy_generator: ""
  });
  const [summaries, setSummaries] = useState<Record<SummaryMode, string | null>>({
    communication: null,
    account_actions: null,
    group_update: null,
    client_response: null,
    meeting_summary: null,
    sales_analyzer: null,
    ad_copy_generator: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<SummaryMode | null>(null);
  const [images, setImages] = useState<Record<SummaryMode, { data: string; mimeType: string; preview: string }[]>>({
    communication: [],
    account_actions: [],
    group_update: [],
    client_response: [],
    meeting_summary: [],
    sales_analyzer: [],
    ad_copy_generator: []
  });
  const [audios, setAudios] = useState<Record<SummaryMode, { data: string; mimeType: string; fileName: string } | null>>({
    communication: null,
    account_actions: null,
    group_update: null,
    client_response: null,
    meeting_summary: null,
    sales_analyzer: null,
    ad_copy_generator: null
  });
  const [pdfs, setPdfs] = useState<Record<SummaryMode, { data: string; mimeType: string; fileName: string }[]>>({
    communication: [],
    account_actions: [],
    group_update: [],
    client_response: [],
    meeting_summary: [],
    sales_analyzer: [],
    ad_copy_generator: []
  });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThreadView, setIsThreadView] = useState(false);
  const [threadMode, setThreadMode] = useState<SummaryMode | null>(null);
  const [threadClientId, setThreadClientId] = useState<string | null>(null);
  
  // Check for URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const modeParam = params.get("mode") as SummaryMode;
    const clientIdParam = params.get("clientId");

    if (view === "thread" && modeParam && clientIdParam) {
      setIsThreadView(true);
      setThreadMode(modeParam);
      setThreadClientId(clientIdParam);
    }
  }, []);
  
  // Clear inputs when client changes
  useEffect(() => {
    setChatTexts({
      communication: "",
      account_actions: "",
      group_update: "",
      client_response: "",
      meeting_summary: "",
      sales_analyzer: "",
      ad_copy_generator: ""
    });
    setSummaries({
      communication: null,
      account_actions: null,
      group_update: null,
      client_response: null,
      meeting_summary: null,
      sales_analyzer: null,
      ad_copy_generator: null
    });
    setImages({
      communication: [],
      account_actions: [],
      group_update: [],
      client_response: [],
      meeting_summary: [],
      sales_analyzer: [],
      ad_copy_generator: []
    });
    setAudios({
      communication: null,
      account_actions: null,
      group_update: null,
      client_response: null,
      meeting_summary: null,
      sales_analyzer: null,
      ad_copy_generator: null
    });
    setPdfs({
      communication: [],
      account_actions: [],
      group_update: [],
      client_response: [],
      meeting_summary: [],
      sales_analyzer: [],
      ad_copy_generator: []
    });
    setMode(null);
    setError(null);
    setNiche("");
    setGeneratedAdCopy(null);
    setAdProductInfo("");
  }, [selectedClientId]);
  
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        setProfilePic(user.photoURL);
        setDisplayName(user.displayName || "");
      } else {
        setProfilePic(null);
        setDisplayName("");
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test Connection
  useEffect(() => {
    if (isAuthReady && user) {
      const testConnection = async () => {
        const path = 'test/connection';
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          } else if (error instanceof Error && error.message.includes('permission-denied')) {
            // Silently handle permission denied for test connection if needed, 
            // but we'll use the handler to be safe
            try {
              handleFirestoreError(error, OperationType.GET, path);
            } catch (e) {
              // Just log, don't crash the whole app for a connection test
            }
          }
        }
      };
      testConnection();
    }
  }, [isAuthReady, user]);

  // Fetch Clients
  useEffect(() => {
    if (!user) {
      setClients([]);
      return;
    }

    const q = query(
      collection(db, "clients"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const path = "clients";
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
      setClients(clientsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch History for selected client
  useEffect(() => {
    if (!user || !selectedClientId) {
      setClientHistories([]);
      return;
    }

    const q = query(
      collection(db, "histories"),
      where("clientId", "==", selectedClientId),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const path = "histories";
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryRecord[];
      setClientHistories(historyData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user, selectedClientId]);

  // Fetch ALL Histories for Metrics
  useEffect(() => {
    if (!user) {
      setAllHistories([]);
      return;
    }

    const q = query(
      collection(db, "histories"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const path = "histories";
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryRecord[];
      setAllHistories(historyData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Filtered Histories for Dashboard
  const filteredDashboardHistories = allHistories.filter(history => {
    // Client filter
    if (dashboardClientFilter && history.clientId !== dashboardClientFilter) return false;

    if (dashboardDateFilter === "all") return true;
    
    const historyDate = history.createdAt?.toDate ? history.createdAt.toDate() : new Date(history.createdAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (dashboardDateFilter === "today") {
      return historyDate >= today;
    }
    
    if (dashboardDateFilter === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return historyDate >= yesterday && historyDate < today;
    }
    
    if (dashboardDateFilter === "7days") {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 7 days including today
      return historyDate >= sevenDaysAgo && historyDate <= now;
    }
    
    if (dashboardDateFilter === "30days") {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); // 30 days including today
      return historyDate >= thirtyDaysAgo && historyDate <= now;
    }

    if (dashboardDateFilter === "current_month") {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return historyDate >= firstDayOfMonth;
    }
    
    if (dashboardDateFilter === "custom" && dashboardCustomStart && dashboardCustomEnd) {
      const start = new Date(dashboardCustomStart);
      const end = new Date(dashboardCustomEnd);
      end.setHours(23, 59, 59, 999);
      return historyDate >= start && historyDate <= end;
    }
    
    return true;
  });

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError("E-mail ou senha incorretos. Verifique seus dados ou crie uma conta se ainda não tiver uma.");
      } else {
        setAuthError("Falha ao entrar. Verifique sua conexão ou tente novamente mais tarde.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setAuthError("Por favor, insira seu e-mail para redefinir a senha.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthSuccess("E-mail de redefinição enviado! Verifique sua caixa de entrada.");
    } catch (err: any) {
      console.error("Reset password error:", err);
      if (err.code === 'auth/user-not-found') {
        setAuthError("E-mail não encontrado.");
      } else {
        setAuthError("Falha ao enviar e-mail de redefinição. Tente novamente.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });
      // setUser will be updated by onAuthStateChanged
    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError("Este e-mail já está em uso.");
      } else if (err.code === 'auth/weak-password') {
        setAuthError("A senha deve ter pelo menos 6 caracteres.");
      } else {
        setAuthError("Falha ao criar conta. Tente novamente.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google login error:", err);
      setAuthError("Falha ao entrar com Google. Tente novamente.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleProfilePicUpload = (e: React.ChangeEvent<HTMLInputElement>, isTemp = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (isTemp) {
          setTempProfilePic(result);
        } else {
          setProfilePic(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      await updateProfile(user, {
        displayName: tempDisplayName,
        photoURL: tempProfilePic
      });
      setProfilePic(tempProfilePic);
      setDisplayName(tempDisplayName);
      setIsProfileModalOpen(false);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setAuthError("Falha ao atualizar perfil. Tente novamente.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedClientId("");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newClientName.trim()) return;

    const path = "clients";
    try {
      await addDoc(collection(db, path), {
        name: newClientName.trim(),
        niche: newClientNiche.trim(),
        logo: newClientLogo,
        platforms: newClientPlatforms,
        investmentValue: parseFloat(newClientInvestment) || 0,
        platformInvestments: Object.fromEntries(
          Object.entries(newClientPlatformInvestments).map(([k, v]) => [k, parseFloat(v) || 0])
        ),
        status: newClientStatus,
        currency: newClientCurrency,
        createdAt: serverTimestamp(),
        uid: user.uid
      });
      setNewClientName("");
      setNewClientNiche("");
      setNewClientLogo(null);
      setNewClientPlatforms(["Google", "Meta"]);
      setNewClientInvestment("");
      setNewClientPlatformInvestments({});
      setNewClientStatus('active');
      setNewClientCurrency("BRL");
      setIsClientModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingClientId || !editingClientName.trim()) return;

    const path = `clients/${editingClientId}`;
    try {
      await updateDoc(doc(db, "clients", editingClientId), {
        name: editingClientName.trim(),
        niche: newClientNiche.trim(),
        logo: newClientLogo,
        platforms: newClientPlatforms,
        investmentValue: parseFloat(newClientInvestment) || 0,
        platformInvestments: Object.fromEntries(
          Object.entries(isEditingClient ? editingClientPlatformInvestments : newClientPlatformInvestments).map(([k, v]) => [k, parseFloat(v) || 0])
        ),
        status: isEditingClient ? editingClientStatus : newClientStatus,
        currency: newClientCurrency
      });
      setIsEditingClient(false);
      setIsClientModalOpen(false);
      setEditingClientId("");
      setEditingClientName("");
      setNewClientNiche("");
      setNewClientLogo(null);
      setNewClientPlatforms(["Google", "Meta"]);
      setNewClientInvestment("");
      setNewClientPlatformInvestments({});
      setEditingClientPlatformInvestments({});
      setNewClientStatus('active');
      setEditingClientStatus('active');
      setNewClientCurrency("BRL");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleSelectClient = (clientId: string) => {
    if (clientId === selectedClientId) return;
    
    const client = clients.find(c => c.id === clientId);
    const clientName = client ? client.name : "Remover filtro";

    // If no client is currently selected, skip confirmation
    if (!selectedClientId && !isGenericMode) {
      setSelectedClientId(clientId);
      setIsGenericMode(false);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: clientId ? "Alterar Cliente" : "Remover Filtro",
      message: clientId 
        ? `Deseja alterar o cliente selecionado para "${clientName}"?`
        : "Deseja remover o filtro de cliente e ver todos os registros?",
      type: 'warning',
      onConfirm: () => {
        setSelectedClientId(clientId);
        setIsGenericMode(false);
      }
    });
  };

  const handleDeleteClient = (clientId: string) => {
    if (!user) return;
    
    setConfirmModal({
      isOpen: true,
      title: "Excluir Cliente",
      message: "Tem certeza que deseja remover este cliente e TODO o seu histórico? Esta ação não pode ser desfeita.",
      type: 'danger',
      onConfirm: async () => {
        const path = `clients/${clientId}`;
        try {
          await deleteDoc(doc(db, "clients", clientId));
          if (selectedClientId === clientId) setSelectedClientId("");
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, path);
        }
      }
    });
  };

  const saveToHistory = async (content: string) => {
    if (!user || !selectedClientId) return;

    const path = "histories";
    let finalMode = mode;
    let finalContent = content;

    // Merge client_response into group_update with prefix
    if (mode === "client_response") {
      finalMode = "group_update";
      finalContent = `[RESPOSTA AO CLIENTE] ${content}`;
    } else if (mode === "group_update") {
      finalContent = `[ENVIO DE MENSAGEM] ${content}`;
    } else if (mode === "sales_analyzer") {
      finalMode = "sales_analyzer";
      // Save the WhatsApp version (second part) to history as the "summary"
      const parts = content.split("[SPLIT_VERSION]");
      finalContent = `[ANÁLISE DE VENDAS WHATSAPP] ${parts[1] || parts[0]}`;
    }

    try {
      await addDoc(collection(db, path), {
        clientId: selectedClientId,
        mode: finalMode,
        content: finalContent,
        createdAt: serverTimestamp(),
        uid: user.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleSummarizeHistory = () => {
    if (!user || !selectedClientId || clientHistories.length === 0) return;
    setIsSummaryOptionsModalOpen(true);
  };

  const executeSummarizeHistory = async () => {
    if (!user || !selectedClientId || clientHistories.length === 0) return;

    setIsSummarizingHistory(true);
    setHistorySummary(null);
    setGroupMessage(null);
    setError(null);
    setIsSummaryOptionsModalOpen(false);

    try {
      let filteredHistory = getFilteredHistory();
      
      if (summaryOption === "selected") {
        filteredHistory = filteredHistory.filter(h => {
          if (selectedSummaryModes.includes("group_update")) {
            return selectedSummaryModes.includes(h.mode as SummaryMode) || h.mode === "client_response";
          }
          return selectedSummaryModes.includes(h.mode as SummaryMode);
        });
      }

      if (filteredHistory.length === 0) {
        setError("Nenhum registro encontrado para a seleção atual.");
        return;
      }

      const periodText = appliedDateFilter.type === "today" ? "hoje" :
                        appliedDateFilter.type === "yesterday" ? "ontem" :
                        appliedDateFilter.type === "7days" ? "últimos 7 dias" :
                        appliedDateFilter.type === "30days" ? "últimos 30 dias" :
                        appliedDateFilter.type === "custom" ? `de ${appliedDateFilter.customStartDate} até ${appliedDateFilter.customEndDate}` :
                        appliedDateFilter.type === "specific" ? `do dia ${appliedDateFilter.specificDate}` : "todo o período";

      const records = filteredHistory.map(h => ({
        mode: h.mode,
        content: h.content,
        createdAt: h.createdAt?.toDate().toLocaleString('pt-BR') || ""
      }));

      const summary = await summarizeHistory(
        records, 
        periodText, 
        clients.find(c => c.id === selectedClientId)?.name || "Cliente"
      );
      setHistorySummary(summary);
      
      // Scroll to result
      setTimeout(() => {
        const element = document.getElementById("history-summary-result");
        if (element) element.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      console.error("Error summarizing history:", err);
      setError("Falha ao gerar os insights do histórico.");
    } finally {
      setIsSummarizingHistory(false);
    }
  };

  const handleGenerateGroupMessage = async () => {
    if (!historySummary) return;

    setIsGeneratingGroupMessage(true);
    setGroupMessage(null);
    setError(null);

    try {
      const message = await generateGroupMessageFromHistory(historySummary);
      setGroupMessage(message);
    } catch (err) {
      console.error("Error generating group message:", err);
      setError("Falha ao gerar a mensagem para o grupo.");
    } finally {
      setIsGeneratingGroupMessage(false);
    }
  };

  const handleExportPDF = async () => {
    const element = document.getElementById("history-summary-content");
    if (!element) return;

    try {
      setLoading(true);
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById("history-summary-content");
          if (clonedElement) {
            // Force standard colors for the container
            clonedElement.style.backgroundColor = "#ffffff";
            clonedElement.style.color = "#111827";
            
            // Recursively clean up all elements in the clone
            const allElements = clonedElement.getElementsByTagName("*");
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              
              // Force standard colors for common properties to bypass oklch issues
              const computedStyle = window.getComputedStyle(el);
              
              if (computedStyle.color.includes("oklch")) {
                el.style.color = "#374151";
              }
              if (computedStyle.backgroundColor.includes("oklch")) {
                el.style.backgroundColor = "transparent";
              }
              if (computedStyle.borderColor.includes("oklch")) {
                el.style.borderColor = "#e5e7eb";
              }
              
              // Specific overrides for known elements
              if (el.tagName === "H2" || el.tagName === "H1" || el.tagName === "H3") {
                el.style.color = "#111827";
              }
              if (el.tagName === "P" || el.tagName === "LI") {
                el.style.color = "#374151";
              }
            }
          }
        }
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      const fileName = `GDT_Insights_💡_${clients.find(c => c.id === selectedClientId)?.name || "Cliente"}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      setError("Falha ao exportar PDF: Verifique se há cores modernas não suportadas.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilter = () => {
    setAppliedDateFilter({
      type: historyDateFilter,
      specificDate,
      customStartDate,
      customEndDate
    });
  };

  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const getFilteredHistory = (records = clientHistories, filter = appliedDateFilter) => {
    if (filter.type === "all") return records;

    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (filter.type === "today") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (filter.type === "yesterday") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter.type === "7days") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 6); // 7 days including today
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (filter.type === "30days") {
      startDate = new Date();
      startDate.setDate(now.getDate() - 29); // 30 days including today
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (filter.type === "custom") {
      startDate = parseLocalDate(filter.customStartDate);
      endDate = parseLocalDate(filter.customEndDate);
      if (endDate) endDate.setHours(23, 59, 59, 999);
    } else if (filter.type === "specific") {
      startDate = parseLocalDate(filter.specificDate);
      if (startDate) startDate.setHours(0, 0, 0, 0);
      endDate = parseLocalDate(filter.specificDate);
      if (endDate) endDate.setHours(23, 59, 59, 999);
    }

    return records.filter(h => {
      const date = h.createdAt?.toDate ? h.createdAt.toDate() : new Date(h.createdAt);
      if (!date) return false;
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    });
  };

  const handleClearHistory = async (modeToClear?: SummaryMode) => {
    if (!user || !selectedClientId) return;
    
    const title = modeToClear ? "Limpar Categoria" : "Limpar Histórico";
    const message = modeToClear 
      ? `Tem certeza que deseja apagar todo o histórico de ${
          modeToClear === "communication" ? "Comunicados no Grupo" : 
          modeToClear === "account_actions" ? "Ações da Conta" : 
          modeToClear === "group_update" ? "Visão Executiva do Grupo" : 
          modeToClear === "client_response" ? "Respostas" : 
          "Análise Estratégica de Reunião"
        } deste cliente?`
      : "Tem certeza que deseja apagar TODO o histórico deste cliente? Esta ação não pode ser desfeita.";

    setConfirmModal({
      isOpen: true,
      title,
      message,
      type: 'danger',
      onConfirm: async () => {
        try {
          const historiesToDelete = clientHistories.filter(h => !modeToClear || h.mode === modeToClear);
          for (const h of historiesToDelete) {
            await deleteDoc(doc(db, "histories", h.id));
          }
        } catch (err) {
          console.error("Error clearing history:", err);
          setError("Erro ao limpar histórico.");
        }
      }
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64String = (reader.result as string).split(',')[1];
          try {
            const transcription = await transcribeAudio({
              data: base64String,
              mimeType: 'audio/webm'
            });
            
            if (transcription) {
              setChatTexts(prev => {
                const currentText = prev[mode];
                const separator = currentText.trim() ? "\n\n" : "";
                return {
                  ...prev,
                  [mode]: currentText + separator + transcription
                };
              });
            }
          } catch (err) {
            console.error("Transcription error:", err);
            setError("Falha ao transcrever o áudio. Tente novamente.");
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.onerror = () => {
          setIsTranscribing(false);
          setError("Erro ao processar o áudio gravado.");
        };
        reader.readAsDataURL(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSummarize = async () => {
    if (!selectedClientId && !isGenericMode) {
      setError("Por favor, selecione um cliente ou utilize o modo genérico para continuar.");
      return;
    }

    const currentText = chatTexts[mode!];
    const currentImages = images[mode!];
    const currentAudio = audios[mode!];
    const currentPdfs = pdfs[mode!];

    if (mode === "sales_analyzer" && !niche.trim()) {
      setError("Por favor, informe o nicho de atuação para a análise.");
      return;
    }

    if (!currentText.trim() && currentImages.length === 0 && !currentAudio && currentPdfs.length === 0) {
      setError("Por favor, forneça dados (texto, imagem, áudio ou PDF) para análise.");
      return;
    }

    setLoading(true);
    setError(null);
    setSummaries(prev => ({ ...prev, [mode!]: null }));

    try {
      const promptText = mode === "sales_analyzer" 
        ? `NICHO: ${niche}\n\nCONVERSAS:\n${currentText}`
        : currentText;

      const result = await summarizeChat(
        promptText, 
        mode!, 
        currentImages.length > 0 ? currentImages.map(img => ({ data: img.data, mimeType: img.mimeType })) : undefined,
        currentAudio ? { data: currentAudio.data, mimeType: currentAudio.mimeType } : undefined,
        currentPdfs.length > 0 ? currentPdfs.map(pdf => ({ data: pdf.data, mimeType: pdf.mimeType })) : undefined
      );
      const finalResult = result || "Não foi possível gerar um insight estratégico.";
      setSummaries(prev => ({ ...prev, [mode!]: finalResult }));
      
      // Auto-save to history if client is selected
      if (selectedClientId && user) {
        await saveToHistory(finalResult);
        
        if (mode === "sales_analyzer") {
          // Register metrics
          try {
            await addDoc(collection(db, "sales_analyses"), {
              clientId: selectedClientId,
              niche: niche,
              createdAt: serverTimestamp(),
              uid: user.uid
            });
          } catch (mErr) {
            console.error("Error saving metrics:", mErr);
          }
        }
      }

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAdCopy = async () => {
    if (!selectedClientId && !isGenericMode) {
      setError("Por favor, selecione um cliente ou utilize o modo genérico para continuar.");
      return;
    }

    if (!adProductInfo.trim() && images[mode!].length === 0) {
      setError("Por favor, forneça informações sobre o produto ou serviço.");
      return;
    }

    setIsGeneratingAdCopy(true);
    setError(null);
    setGeneratedAdCopy(null);

    try {
      const currentImages = images[mode!];
      const result = await generateAdCopy(
        adPlatform,
        adLanguage,
        adProductInfo,
        currentImages.length > 0 ? currentImages.map(img => ({ data: img.data, mimeType: img.mimeType })) : undefined
      );

      setGeneratedAdCopy(result);
      setSummaries(prev => ({ ...prev, [mode!]: result }));
      
      // Auto-save to history if client is selected
      if (selectedClientId && user) {
        const historyPath = "histories";
        try {
          await addDoc(collection(db, historyPath), {
            clientId: selectedClientId,
            mode: "ad_copy_generator",
            content: `[COPY DE ANÚNCIO - ${adPlatform.toUpperCase()}] ${result}`,
            createdAt: serverTimestamp(),
            uid: user.uid
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, historyPath);
        }
      }

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar a copy do anúncio.");
    } finally {
      setIsGeneratingAdCopy(false);
    }
  };

  const handleCopy = async () => {
    const currentSummary = mode === "ad_copy_generator" ? generatedAdCopy : summaries[mode!];
    if (currentSummary && resultRef.current) {
      try {
        let plainText = currentSummary;
        
        // Handle sales_analyzer split
        if (mode === "sales_analyzer") {
          const parts = currentSummary.split("[SPLIT_VERSION]");
          let text = parts[1] || parts[0];
          
          // Clean up any potential headers the AI might have included
          text = text
            .replace(/^PARTE 2:.*$/gim, "")
            .replace(/^VERSÃO WHATSAPP.*$/gim, "")
            .replace(/^Esta versão deve ser.*$/gim, "")
            .trim();
            
          plainText = text;
        }

        // WhatsApp uses * for bold instead of **
        if (mode === "group_update" || mode === "client_response" || mode === "meeting_summary" || mode === "sales_analyzer" || mode === "ad_copy_generator") {
          plainText = plainText
            .replace(/\*\*(.*?)\*\*/g, '*$1*')
            .replace(/__(.*?)__/g, '*$1*');
        }

        const htmlContent = resultRef.current.innerHTML;

        const blobHtml = new Blob([htmlContent], { type: "text/html" });
        const blobText = new Blob([plainText], { type: "text/plain" });
        
        const data = [new ClipboardItem({
          ["text/html"]: blobHtml,
          ["text/plain"]: blobText,
        })];

        await navigator.clipboard.write(data);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Rich copy failed, falling back to text:", err);
        let plainText = currentSummary;
        
        if (mode === "sales_analyzer") {
          const parts = currentSummary.split("[SPLIT_VERSION]");
          let text = parts[1] || parts[0];
          
          // Clean up any potential headers the AI might have included
          text = text
            .replace(/^PARTE 2:.*$/gim, "")
            .replace(/^VERSÃO WHATSAPP.*$/gim, "")
            .replace(/^Esta versão deve ser.*$/gim, "")
            .trim();
            
          plainText = text;
        }

        if (mode === "group_update" || mode === "client_response" || mode === "meeting_summary" || mode === "sales_analyzer" || mode === "ad_copy_generator") {
          plainText = plainText
            .replace(/\*\*(.*?)\*\*/g, '*$1*')
            .replace(/__(.*?)__/g, '*$1*');
        }
        navigator.clipboard.writeText(plainText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleDownloadPDF = async () => {
    if (!resultRef.current || !summaries[mode!]) return;
    
    setLoading(true);
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const canvas = await html2canvas(resultRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL("image/png");
      const imgProps = doc.getImageProperties(imgData);
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      doc.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      doc.save(`analise-vendas-whatsapp-${selectedClient?.name || "cliente"}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setError("Falha ao gerar o PDF. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setChatTexts(prev => ({ ...prev, [mode!]: "" }));
    setSummaries(prev => ({ ...prev, [mode!]: null }));
    setError(null);
    setImages(prev => ({ ...prev, [mode!]: [] }));
    setAudios(prev => ({ ...prev, [mode!]: null }));
    setPdfs(prev => ({ ...prev, [mode!]: [] }));
  };

  const handleClearAll = () => {
    setChatTexts({
      communication: "",
      account_actions: "",
      group_update: "",
      client_response: "",
      meeting_summary: "",
      sales_analyzer: "",
      ad_copy_generator: ""
    });
    setSummaries({
      communication: null,
      account_actions: null,
      group_update: null,
      client_response: null,
      meeting_summary: null,
      sales_analyzer: null,
      ad_copy_generator: null
    });
    setError(null);
    setNiche("");
    setImages({
      communication: [],
      account_actions: [],
      group_update: [],
      client_response: [],
      meeting_summary: [],
      sales_analyzer: [],
      ad_copy_generator: []
    });
    setAudios({
      communication: null,
      account_actions: null,
      group_update: null,
      client_response: null,
      meeting_summary: null,
      sales_analyzer: null,
      ad_copy_generator: null
    });
    setPdfs({
      communication: [],
      account_actions: [],
      group_update: [],
      client_response: [],
      meeting_summary: [],
      sales_analyzer: [],
      ad_copy_generator: []
    });
  };

  const handleNewSummarization = () => {
    setSummaries(prev => ({ ...prev, [mode!]: null }));
    setChatTexts(prev => ({ ...prev, [mode!]: "" }));
    setGeneratedAdCopy(null);
    setAdProductInfo("");
    setError(null);
    setNiche("");
    setImages(prev => ({ ...prev, [mode!]: [] }));
    setAudios(prev => ({ ...prev, [mode!]: null }));
    setPdfs(prev => ({ ...prev, [mode!]: [] }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImages(prev => ({
          ...prev,
          [mode!]: [...prev[mode!], {
            data: base64String,
            mimeType: file.type,
            preview: reader.result as string
          }]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsTranscribing(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        
        // Save audio data
        setAudios(prev => ({
          ...prev,
          [mode!]: {
            data: base64String,
            mimeType: file.type,
            fileName: file.name
          }
        }));

        // Transcribe
        try {
          const transcription = await transcribeAudio({
            data: base64String,
            mimeType: file.type
          });
          
          if (transcription) {
            setChatTexts(prev => {
              const currentText = prev[mode!];
              const separator = currentText.trim() ? "\n\n" : "";
              return {
                ...prev,
                [mode!]: currentText + separator + transcription
              };
            });
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setError("Falha ao transcrever o áudio anexado. Tente novamente.");
        } finally {
          setIsTranscribing(false);
        }
      };
      reader.onerror = () => {
        setIsTranscribing(false);
        setError("Erro ao processar o áudio anexado.");
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.type !== "application/pdf") {
        setError("Por favor, selecione um arquivo PDF.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setPdfs(prev => ({
          ...prev,
          [mode!]: [...prev[mode!], {
            data: base64String,
            mimeType: file.type,
            fileName: file.name
          }]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle paste for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                setImages(prev => ({
                  ...prev,
                  [mode!]: [...prev[mode!], {
                    data: base64String,
                    mimeType: file.type,
                    preview: reader.result as string
                  }]
                }));
              };
              reader.readAsDataURL(file);
            }
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [mode]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="animate-spin text-emerald-500" size={48} />
      </div>
    );
  }

  if (isThreadView && threadMode && threadClientId) {
    const client = clients.find(c => c.id === threadClientId);
    const filteredHistory = allHistories
      .filter(h => h.clientId === threadClientId && h.mode === threadMode)
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

    const categoryLabels: Record<SummaryMode, string> = {
      communication: "Comunicados no Grupo",
      account_actions: "Ações da Conta",
      group_update: "Atualização do Grupo",
      client_response: "Resposta ao Cliente",
      meeting_summary: "Análise Estratégica de Reunião",
      sales_analyzer: "Análise de Vendas WhatsApp",
      ad_copy_generator: "Gerador de Copy para Anúncios"
    };

    return (
      <div className="min-h-screen bg-white p-6 max-w-3xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b pb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{categoryLabels[threadMode]}</h1>
            <p className="text-sm text-gray-500">Histórico completo: {client?.name || "Cliente"}</p>
          </div>
          <button 
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
          >
            Fechar Aba
          </button>
        </header>

        <div className="space-y-6">
          {filteredHistory.length > 0 ? (
            filteredHistory.map((item, idx) => (
              <div key={`thread-item-${item.id}-${idx}`} className="relative pl-8 pb-8 border-l-2 border-emerald-100 last:border-0 last:pb-0">
                <div className="absolute left-[-9px] top-0 w-4 h-4 bg-emerald-500 rounded-full border-4 border-white shadow-sm" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <Calendar size={12} />
                    {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('pt-BR') : new Date(item.createdAt).toLocaleString('pt-BR')}
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-6 border border-black/5 prose prose-sm max-w-none text-gray-700">
                    <ReactMarkdown>{item.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-gray-400 italic">
              Nenhum registro encontrado nesta categoria.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f5f5f5] font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-black/5 space-y-8 animate-in fade-in zoom-in-95 duration-300">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/20">
              <MessageSquareText size={32} />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              {isRegistering ? "Criar Conta" : "Bem-vindo de volta"}
            </h2>
            <p className="text-gray-500 text-sm">
              {isRegistering 
                ? "Cadastre-se para começar a gerenciar seus parceiros." 
                : "Entre para acessar seus insights e análises estratégicas."}
            </p>
          </div>

          <form onSubmit={isRegistering ? handleEmailRegister : handleEmailLogin} className="space-y-4">
            {isRegistering && (
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 ml-1">Nome Completo</label>
                <input 
                  type="text" 
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-400 ml-1">E-mail</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase text-gray-400 ml-1">Senha</label>
                {!isRegistering && (
                  <button 
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[10px] font-bold text-emerald-600 hover:underline uppercase tracking-wider transition-all"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-in shake-1">
                <AlertTriangle size={14} />
                {authError}
              </div>
            )}

            {authSuccess && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 size={14} />
                {authSuccess}
              </div>
            )}

            <button 
              type="submit"
              disabled={authLoading}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
              {isRegistering ? "Cadastrar" : "Entrar"}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400 font-bold">Ou continue com</span>
            </div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full py-4 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </button>

          <div className="text-center pt-2">
            <button 
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError(null);
                setAuthSuccess(null);
                setPassword("");
              }}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline transition-all"
            >
              {isRegistering 
                ? "Já tem uma conta? Entre aqui" 
                : "Não tem uma conta? Cadastre-se agora"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans selection:bg-emerald-100 selection:text-emerald-900">
        {/* Header */}
        <header className="bg-white border-b border-black/5 sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                <MessageSquareText size={20} />
              </div>
              <div className="flex flex-col">
                <h1 className="font-bold text-lg tracking-tight hidden sm:block">GDT Insights 💡</h1>
                <p className="text-[10px] text-gray-500 font-medium hidden sm:block">Dados que viram decisões.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsClientsTabOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100 hover:bg-purple-100 transition-all shadow-sm group"
                  title="Gestão de Clientes"
                >
                  <Users size={18} className="group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold hidden md:block">Clientes</span>
                </button>

                <button 
                  onClick={() => setIsDashboardOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all shadow-sm group"
                  title="Painel de Métricas"
                >
                  <BarChart3 size={18} className="group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold hidden md:block">Métricas</span>
                </button>

                <div className="flex flex-col items-end hidden sm:flex">
                  <span className="text-sm font-bold">{user.displayName || user.email?.split('@')[0]}</span>
                  <span className="text-[10px] text-gray-500">{user.email}</span>
                </div>
                
                <div 
                  className="relative group cursor-pointer"
                  onClick={() => {
                    setTempDisplayName(displayName);
                    setTempProfilePic(profilePic);
                    setIsProfileModalOpen(true);
                  }}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-500/20 hover:border-emerald-500 transition-all">
                    {profilePic ? (
                      <img src={profilePic} alt="Perfil" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                        {(displayName || user.email || "?")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  title="Sair"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-12 space-y-12">
          {/* Hero Section */}
          <section className="text-center space-y-4">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Gestão estratégica <br />
              <span className="text-emerald-600">em segundos.</span>
            </h2>
            <p className="text-lg text-[#9e9e9e] max-w-2xl mx-auto">
              Transforme conversas, áudios e prints de Ads em insights estratégicos e decisões baseadas em dados.
            </p>
          </section>

          <AnimatePresence mode="wait">
            {!selectedClientId && !isGenericMode ? (
              <motion.section 
                key="context-picker"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-2xl mx-auto bg-white rounded-[40px] p-12 shadow-xl border border-black/5 text-center space-y-8 mt-12"
              >
                <div className="w-20 h-20 bg-emerald-100 rounded-[32px] flex items-center justify-center text-emerald-600 mx-auto shadow-lg shadow-emerald-500/10">
                  <Users size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Selecione um cliente para começar</h3>
                  <p className="text-gray-500">Escolha um cliente da sua lista ou utilize o sistema sem vínculo específico.</p>
                </div>
                
                <div className="flex flex-col gap-6 items-center">
                  <div className="w-full max-w-md">
                    <ClientSelector 
                      clients={clients}
                      selectedClientId={selectedClientId}
                      onSelect={handleSelectClient}
                      onEdit={(client) => {
                        setConfirmModal({
                          isOpen: true,
                          title: "Editar Cliente",
                          message: `Deseja fazer alterações no cliente "${client.name}"?`,
                          type: 'warning',
                          onConfirm: () => {
                            setEditingClientId(client.id);
                            setEditingClientName(client.name);
                            setNewClientNiche(client.niche || "");
                            setNewClientLogo(client.logo || null);
                            setNewClientPlatforms(client.platforms || ["Google", "Meta"]);
                            setNewClientInvestment(client.investmentValue?.toString() || "");
                            setNewClientCurrency(client.currency || "BRL");
                            setNewClientStatus(client.status || 'active');
                            setEditingClientStatus(client.status || 'active');
                            setEditingClientPlatformInvestments(
                              Object.fromEntries(
                                Object.entries(client.platformInvestments || {}).map(([k, v]) => [k, v.toString()])
                              )
                            );
                            setIsEditingClient(true);
                            setIsClientModalOpen(true);
                          }
                        });
                      }}
                    />
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md">
                    <button 
                      onClick={() => setIsClientModalOpen(true)}
                      className="flex-1 w-full py-4 bg-white border border-black/5 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                    >
                      <UserPlus size={20} className="text-emerald-500" />
                      Novo Cliente
                    </button>
                    <div className="hidden sm:block h-8 w-px bg-gray-200" />
                    <button 
                      onClick={() => setIsGenericMode(true)}
                      className="flex-1 w-full py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles size={20} />
                      Usar sem cliente
                    </button>
                  </div>
                </div>
              </motion.section>
            ) : (
              <motion.div 
                key="app-content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                {/* Dashboard Section */}
                {isDashboardOpen && (
            <section className="bg-white rounded-[40px] p-8 shadow-xl border border-black/5 space-y-8 animate-in zoom-in-95 duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                    <BarChart3 size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Painel de Métricas</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500">Visão geral da demanda por cliente e categoria.</p>
                      {dashboardClientFilter && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold animate-in fade-in slide-in-from-left-2">
                          <span>Filtrando por: {clients.find(c => c.id === dashboardClientFilter)?.name}</span>
                          <button 
                            onClick={() => setDashboardClientFilter(null)}
                            className="hover:bg-emerald-200 rounded-full p-0.5 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>



                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-gray-50 p-1 rounded-2xl border border-black/5">
                    {[
                      { id: "all", label: "Tudo" },
                      { id: "current_month", label: "Mês atual" },
                      { id: "today", label: "Hoje" },
                      { id: "yesterday", label: "Ontem" },
                      { id: "7days", label: "Últimos 7 dias" },
                      { id: "30days", label: "Últimos 30 dias" },
                      { id: "custom", label: "Personalizado" }
                    ].map((filter) => (
                      <button
                        key={`dash-date-filter-${filter.id}`}
                        onClick={() => setDashboardDateFilter(filter.id as DateFilterType)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                          dashboardDateFilter === filter.id 
                            ? "bg-white text-emerald-600 shadow-sm" 
                            : "text-gray-500 hover:text-gray-700"
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setIsDashboardOpen(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 rounded-xl"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Managed Investment */}
                <div className="bg-white p-6 rounded-[32px] border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                      <DollarSign size={20} />
                    </div>
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest">Total Gerido</span>
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-gray-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        clients.reduce((acc, c) => {
                          if (c.currency === 'BRL') return acc + (c.investmentValue || 0);
                          if (c.currency === 'USD') return acc + ((c.investmentValue || 0) * 5);
                          if (c.currency === 'EUR') return acc + ((c.investmentValue || 0) * 5.5);
                          return acc + (c.investmentValue || 0);
                        }, 0)
                      )}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Estimado em BRL</p>
                  </div>
                </div>

                {/* Client Distribution */}
                <div className="bg-white p-6 rounded-[32px] border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                      <Users size={20} />
                    </div>
                    <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-1 rounded-lg uppercase tracking-widest">Carteira</span>
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-gray-900">{clients.length} Clientes</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Ativos no sistema</p>
                  </div>
                </div>

                {/* Total Interactions */}
                <div className="bg-white p-6 rounded-[32px] border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                      <MessageSquareText size={20} />
                    </div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">Interações</span>
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-gray-900">{filteredDashboardHistories.length}</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">No período selecionado</p>
                  </div>
                </div>

                {/* Average Investment */}
                <div className="bg-white p-6 rounded-[32px] border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                      <TrendingUp size={20} />
                    </div>
                    <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-1 rounded-lg uppercase tracking-widest">Ticket Médio</span>
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-gray-900">
                      {clients.length > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        clients.reduce((acc, c) => {
                          if (c.currency === 'BRL') return acc + (c.investmentValue || 0);
                          if (c.currency === 'USD') return acc + ((c.investmentValue || 0) * 5);
                          if (c.currency === 'EUR') return acc + ((c.investmentValue || 0) * 5.5);
                          return acc + (c.investmentValue || 0);
                        }, 0) / clients.length
                      ) : "R$ 0,00"}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Por cliente (Estimado)</p>
                  </div>
                </div>
              </div>

              {dashboardDateFilter === "custom" && (
                <div className="flex items-center gap-4 p-6 bg-gray-50 rounded-[24px] border border-black/5 animate-in slide-in-from-top-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Data Inicial</label>
                    <input 
                      type="date" 
                      value={dashboardCustomStart}
                      onChange={(e) => setDashboardCustomStart(e.target.value)}
                      className="w-full bg-white border border-black/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Data Final</label>
                    <input 
                      type="date" 
                      value={dashboardCustomEnd}
                      onChange={(e) => setDashboardCustomEnd(e.target.value)}
                      className="w-full bg-white border border-black/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Demand by Client */}
                <div className="bg-gray-50 rounded-[32px] p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <Users size={20} className="text-emerald-500" />
                      Demanda por Cliente {dashboardClientFilter && <span className="text-sm font-normal text-gray-400">({clients.find(c => c.id === dashboardClientFilter)?.name})</span>}
                    </h4>
                    {dashboardClientFilter && (
                      <button 
                        onClick={() => setDashboardClientFilter(null)}
                        className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all"
                        title="Limpar filtro de cliente"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={clients.map(client => ({
                          name: client.name,
                          id: client.id,
                          total: filteredDashboardHistories.filter(h => h.clientId === client.id).length
                        }))
                        .filter(d => d.total > 0)
                        .sort((a, b) => b.total - a.total)
                        .slice(0, 10)
                        .map((d, index) => ({
                          ...d,
                          name: `${index + 1}. ${d.name}`
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        onClick={(data: any) => {
                          if (data && data.activePayload && data.activePayload[0]) {
                            setDashboardClientFilter(data.activePayload[0].payload.id);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e5e5" />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={100} 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fontWeight: 600, fill: '#4b5563' }}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="total" fill="#10b981" radius={[0, 8, 8, 0]} barSize={20} className="cursor-pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Demand by Category */}
                <div className="bg-gray-50 rounded-[32px] p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <LayoutList size={20} className="text-blue-500" />
                      Demanda por Categoria {dashboardClientFilter && <span className="text-sm font-normal text-gray-400">({clients.find(c => c.id === dashboardClientFilter)?.name})</span>}
                    </h4>
                    {dashboardClientFilter && (
                      <button 
                        onClick={() => setDashboardClientFilter(null)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all"
                        title="Limpar filtro de cliente"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Comunicados no Grupo', value: filteredDashboardHistories.filter(h => h.mode === 'communication').length, color: '#10b981' },
                            { name: 'Ações da Conta', value: filteredDashboardHistories.filter(h => h.mode === 'account_actions').length, color: '#3b82f6' },
                            { name: 'Atualização do Grupo', value: filteredDashboardHistories.filter(h => h.mode === 'group_update').length, color: '#8b5cf6' },
                            { name: 'Resposta ao Cliente', value: filteredDashboardHistories.filter(h => h.mode === 'client_response').length, color: '#f59e0b' },
                            { name: 'Análise Estratégica de Reunião', value: filteredDashboardHistories.filter(h => h.mode === 'meeting_summary').length, color: '#6366f1' },
                            { name: 'Análise de Vendas', value: filteredDashboardHistories.filter(h => h.mode === 'sales_analyzer').length, color: '#22c55e' },
                          ].filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {[
                            { color: '#10b981' },
                            { color: '#3b82f6' },
                            { color: '#8b5cf6' },
                            { color: '#f59e0b' },
                            { color: '#6366f1' },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Detailed Table */}
              <div className="bg-gray-50 rounded-[32px] p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-lg flex items-center gap-2">
                    <Search size={20} className="text-purple-500" />
                    Detalhamento por Cliente
                  </h4>
                  {dashboardClientFilter && (
                    <button 
                      onClick={() => setDashboardClientFilter(null)}
                      className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2"
                    >
                      <X size={12} />
                      Limpar Filtro de Cliente
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {[...clients]
                    .map(client => {
                      const clientHist = filteredDashboardHistories.filter(h => h.clientId === client.id);
                      return {
                        ...client,
                        history: clientHist,
                        updateCount: clientHist.length
                      };
                    })
                    .filter(c => c.updateCount > 0)
                    .sort((a, b) => b.updateCount - a.updateCount)
                    .map(client => {
                      const isExpanded = expandedMetricsClientId === client.id;
                      
                      const stats = [
                        { label: "Comunicados", value: client.history.filter(h => h.mode === 'communication').length, color: "text-blue-600", bg: "bg-blue-50", icon: LayoutList },
                        { label: "Ações", value: client.history.filter(h => h.mode === 'account_actions').length, color: "text-purple-600", bg: "bg-purple-50", icon: Briefcase },
                        { label: "Visão Executiva", value: client.history.filter(h => h.mode === 'group_update' || h.mode === 'client_response').length, color: "text-emerald-600", bg: "bg-emerald-50", icon: Users },
                        { label: "Reuniões", value: client.history.filter(h => h.mode === 'meeting_summary').length, color: "text-indigo-600", bg: "bg-indigo-50", icon: Calendar },
                      ];

                      return (
                        <div key={client.id} className="bg-white rounded-[24px] border border-black/5 overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md">
                          {/* Row Header */}
                          <div 
                            onClick={() => setExpandedMetricsClientId(isExpanded ? null : client.id)}
                            className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-black text-lg">
                                {client.name[0].toUpperCase()}
                              </div>
                              <div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDashboardClientFilter(client.id);
                                  }}
                                  className="font-black text-gray-900 leading-tight hover:text-emerald-600 transition-colors text-left"
                                >
                                  {client.name}
                                </button>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                  <HistoryIcon size={10} />
                                  {client.updateCount} insights no período
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-full transition-transform duration-300", isExpanded ? "rotate-180 bg-emerald-50 text-emerald-600" : "text-gray-400")}>
                                <ChevronDown size={20} />
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="px-6 pb-6 pt-2 border-t border-black/5 bg-gray-50/30 animate-in slide-in-from-top-2 duration-300">
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                {stats.map((stat, i) => (
                                  <div key={`stat-${i}`} className={cn("p-4 rounded-2xl border border-black/5 flex flex-col items-center justify-center text-center space-y-1", stat.bg)}>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{stat.label}</span>
                                    <span className={cn("text-xl font-black", stat.color)}>{stat.value}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setClientForHistoryModal(client);
                                    setIsClientHistoryModalOpen(true);
                                  }}
                                  className="flex-1 py-3 bg-white border border-black/5 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                                >
                                  <HistoryIcon size={14} />
                                  Ver Histórico Completo
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedClientId(client.id);
                                    setIsDashboardOpen(false);
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                  className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
                                >
                                  <Briefcase size={14} />
                                  Gerenciar Cliente
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </section>
          )}

                {/* Client Selection & Management */}
                {user && (
                  <section className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <Users size={20} className="text-emerald-500" />
                          {selectedClient ? selectedClient.name : (isGenericMode ? "Modo Genérico" : "Selecione o Cliente")}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {isGenericMode 
                            ? "Trabalhando em modo genérico. O histórico não será salvo automaticamente." 
                            : "O histórico será salvo automaticamente para o cliente selecionado."}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto flex-1">
                        <ClientSelector 
                          clients={clients}
                          selectedClientId={selectedClientId}
                          onSelect={handleSelectClient}
                          onEdit={(client) => {
                            setConfirmModal({
                              isOpen: true,
                              title: "Editar Cliente",
                              message: `Deseja fazer alterações no cliente "${client.name}"?`,
                              type: 'warning',
                              onConfirm: () => {
                                setEditingClientId(client.id);
                                setEditingClientName(client.name);
                                setNewClientNiche(client.niche || "");
                                setNewClientLogo(client.logo || null);
                                setNewClientPlatforms(client.platforms || ["Google", "Meta"]);
                                setNewClientInvestment(client.investmentValue?.toString() || "");
                                setNewClientCurrency(client.currency || "BRL");
                                setNewClientStatus(client.status || 'active');
                                setEditingClientStatus(client.status || 'active');
                                setEditingClientPlatformInvestments(
                                  Object.fromEntries(
                                    Object.entries(client.platformInvestments || {}).map(([k, v]) => [k, v.toString()])
                                  )
                                );
                                setIsEditingClient(true);
                                setIsClientModalOpen(true);
                              }
                            });
                          }}
                        />
                        <button 
                          onClick={() => setIsClientModalOpen(true)}
                          className="p-2.5 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                          title="Adicionar Cliente"
                        >
                          <UserPlus size={20} />
                        </button>
                        {selectedClientId && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleClearHistory()}
                              className="p-2.5 bg-white border border-orange-100 text-orange-500 rounded-2xl hover:bg-orange-50 transition-all"
                              title="Limpar Todo o Histórico"
                            >
                              <Trash2 size={20} />
                            </button>
                            <button 
                              onClick={() => handleDeleteClient(selectedClientId)}
                              className="p-2.5 bg-white border border-red-100 text-red-500 rounded-2xl hover:bg-red-50 transition-all"
                              title="Remover Cliente"
                            >
                              <UserMinus size={20} />
                            </button>
                          </div>
                        )}
                        {isGenericMode && (
                          <button 
                            onClick={() => setIsGenericMode(false)}
                            className="p-2.5 bg-white border border-gray-100 text-gray-500 rounded-2xl hover:bg-gray-50 transition-all"
                            title="Sair do Modo Genérico"
                          >
                            <X size={20} />
                          </button>
                        )}
                      </div>
                    </div>

              {selectedClientId && (
                <div className="pt-4 border-t border-black/5 flex items-center justify-between">
                  <button 
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                    className="flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    <HistoryIcon size={18} />
                    {isHistoryOpen ? "Ocultar Histórico" : "Ver Histórico do Cliente"}
                    <span className="bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">{clientHistories.length}</span>
                  </button>
                </div>
              )}

              {/* History View */}
              {isHistoryOpen && selectedClientId && (
                <div className="space-y-8 animate-in slide-in-from-top-4 duration-300">
                  {/* History Filters & Summary Tools */}
                  <div className="bg-gray-50 rounded-2xl p-6 border border-black/5 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                      <div className="space-y-4 flex-1">
                        <label className="text-xs font-bold uppercase text-gray-400 block">Filtrar por Período</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: "all", label: "Tudo" },
                            { id: "today", label: "Hoje" },
                            { id: "yesterday", label: "Ontem" },
                            { id: "7days", label: "Últimos 7 dias" },
                            { id: "30days", label: "Últimos 30 dias" },
                            { id: "specific", label: "Datas específicas" },
                            { id: "custom", label: "Personalizado" }
                          ].map(filter => (
                            <button
                              key={`hist-date-filter-${filter.id}`}
                              onClick={() => {
                                setHistoryDateFilter(filter.id as any);
                                // Automatically apply for non-input filters
                                if (["all", "today", "yesterday", "7days", "30days"].includes(filter.id)) {
                                  setAppliedDateFilter(prev => ({ ...prev, type: filter.id as any }));
                                }
                              }}
                              className={cn(
                                "px-4 py-2 rounded-full text-xs font-bold transition-all",
                                historyDateFilter === filter.id 
                                  ? "bg-emerald-500 text-white shadow-sm" 
                                  : "bg-white border border-black/5 text-gray-500 hover:bg-gray-100"
                              )}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>

                        {(historyDateFilter === "specific" || historyDateFilter === "custom") && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 animate-in fade-in slide-in-from-left-2">
                            {historyDateFilter === "specific" ? (
                              <input 
                                type="date" 
                                value={specificDate}
                                onChange={(e) => setSpecificDate(e.target.value)}
                                className="px-4 py-2 bg-white border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <input 
                                  type="date" 
                                  value={customStartDate}
                                  onChange={(e) => setCustomStartDate(e.target.value)}
                                  className="px-4 py-2 bg-white border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                                <span className="text-gray-400">até</span>
                                <input 
                                  type="date" 
                                  value={customEndDate}
                                  onChange={(e) => setCustomEndDate(e.target.value)}
                                  className="px-4 py-2 bg-white border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                              </div>
                            )}
                            <button
                              onClick={handleApplyFilter}
                              className="px-6 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-200 transition-all"
                            >
                              Aplicar Filtro
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={handleSummarizeHistory}
                          disabled={isSummarizingHistory || clientHistories.length === 0}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                          {isSummarizingHistory ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                          Gerar Insights do Período
                        </button>
                        <button
                          onClick={() => handleClearHistory()}
                          className="flex items-center gap-2 px-6 py-3 bg-white border border-red-100 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={16} />
                          Limpar Tudo
                        </button>
                      </div>
                    </div>

                    {/* History Summary Result */}
                    {historySummary && (
                      <div id="history-summary-result" className="bg-white rounded-2xl p-6 border border-emerald-100 space-y-6 animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 size={18} className="text-emerald-500" />
                            GDT Insights 💡 — Relatório Estratégico
                          </h4>
                          <div className="flex gap-2">
                            <button
                              onClick={handleExportPDF}
                              className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-full text-xs font-bold hover:bg-emerald-50 transition-all"
                            >
                              <FileDown size={14} />
                              Exportar PDF
                            </button>
                            <button
                              onClick={handleGenerateGroupMessage}
                              disabled={isGeneratingGroupMessage}
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold hover:bg-emerald-200 transition-all"
                            >
                              {isGeneratingGroupMessage ? <Loader2 className="animate-spin" size={14} /> : <MessageCircle size={14} />}
                              Gerar Mensagem p/ Grupo
                            </button>
                            <button
                              onClick={() => setHistorySummary(null)}
                              className="p-2 text-gray-400 hover:text-gray-600"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                        
                        <div 
                          id="history-summary-content" 
                          className="p-8 rounded-2xl shadow-sm pdf-export-safe"
                          style={{ backgroundColor: '#ffffff', border: '1px solid #f3f4f6', color: '#111827' }}
                        >
                          <div className="mb-8 pb-6 flex items-center justify-between" style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <div>
                              <h2 className="text-2xl font-bold" style={{ color: '#111827' }}>GDT Insights 💡 — Relatório Estratégico</h2>
                              <p className="text-sm font-medium" style={{ color: '#6b7280' }}>Visão executiva baseada nos dados selecionados</p>
                              <p className="text-xs" style={{ color: '#9ca3af' }}>Cliente: {clients.find(c => c.id === selectedClientId)?.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold uppercase" style={{ color: '#059669' }}>Período</p>
                              <p className="text-sm font-medium" style={{ color: '#374151' }}>
                                {appliedDateFilter.type === "today" ? "Hoje" :
                                 appliedDateFilter.type === "yesterday" ? "Ontem" :
                                 appliedDateFilter.type === "7days" ? "Últimos 7 dias" :
                                 appliedDateFilter.type === "30days" ? "Últimos 30 dias" :
                                 appliedDateFilter.type === "custom" ? `${appliedDateFilter.customStartDate} a ${appliedDateFilter.customEndDate}` :
                                 appliedDateFilter.type === "specific" ? `${appliedDateFilter.specificDate}` : "Todo o período"}
                              </p>
                            </div>
                          </div>
                          <div className="prose prose-sm max-w-none" style={{ color: '#374151' }}>
                            <ReactMarkdown>{historySummary}</ReactMarkdown>
                          </div>
                        </div>

                        {groupMessage && (
                          <div className="mt-6 pt-6 border-t border-emerald-50 space-y-4 animate-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                              <h5 className="text-xs font-bold uppercase tracking-widest text-emerald-600">Mensagem Sugerida para WhatsApp</h5>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(groupMessage);
                                  setCopied(true);
                                  setTimeout(() => setCopied(false), 2000);
                                }}
                                className="flex items-center gap-1 text-xs font-bold text-emerald-500 hover:underline"
                              >
                                {copied ? "Copiado!" : "Copiar Mensagem"}
                              </button>
                            </div>
                            <div className="bg-emerald-50/50 p-4 rounded-xl text-sm text-gray-700 whitespace-pre-wrap border border-emerald-100/50">
                              {groupMessage}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selection Controls */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest">GDT Insights 💡</h4>
                      <div className="h-4 w-px bg-gray-200" />
                      <button 
                        onClick={() => {
                          if (selectedSummaryModes.length === 6) {
                            setSelectedSummaryModes([]);
                          } else {
                            setSelectedSummaryModes(["communication", "account_actions", "group_update", "meeting_summary", "sales_analyzer", "ad_copy_generator"]);
                          }
                        }}
                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-all",
                          selectedSummaryModes.length === 6 ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-gray-300"
                        )}>
                          {selectedSummaryModes.length === 6 && <CheckCircle2 size={10} />}
                        </div>
                        {selectedSummaryModes.length === 6 ? "Desmarcar Todos" : "Selecionar Todos"}
                      </button>
                    </div>
                  </div>

                  {/* Categorized History Boxes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[
                        { id: "communication", label: "Comunicados no Grupo", icon: LayoutList, color: "blue" },
                        { id: "account_actions", label: "Ações da Conta", icon: Briefcase, color: "purple" },
                        { id: "group_update", label: "Atualização do Grupo", icon: Sparkles, color: "emerald" },
                        { id: "meeting_summary", label: "Análise Estratégica de Reunião", icon: Calendar, color: "indigo" },
                        { id: "sales_analyzer", label: "Analisador de WhatsApp", icon: MessageCircle, color: "orange" },
                        { id: "ad_copy_generator", label: "Gerador de Copy para anúncios", icon: Sparkles, color: "pink" }
                      ].map(category => {
                      const isSelected = selectedSummaryModes.includes(category.id as SummaryMode);
                      const filtered = getFilteredHistory().filter(h => {
                        if (category.id === "group_update") {
                          return h.mode === "group_update" || h.mode === "client_response";
                        }
                        return h.mode === category.id;
                      });
                      
                      const lastUpdate = filtered[0]; // Already sorted by createdAt desc in useEffect
                      
                      return (
                        <div 
                          key={`dash-cat-${category.id}`} 
                          className={cn(
                            "bg-white rounded-[32px] border overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-all group relative",
                            isSelected ? "border-emerald-500/30 ring-1 ring-emerald-500/10" : "border-black/5"
                          )}
                        >
                          {/* Selection Checkbox */}
                          <button
                            onClick={() => {
                              setSelectedSummaryModes(prev => 
                                prev.includes(category.id as SummaryMode)
                                  ? prev.filter(m => m !== category.id)
                                  : [...prev, category.id as SummaryMode]
                              );
                            }}
                            className="absolute top-4 right-4 z-10 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all"
                            style={{ 
                              backgroundColor: isSelected ? '#10b981' : 'white',
                              borderColor: isSelected ? '#10b981' : '#e5e7eb'
                            }}
                          >
                            {isSelected && <CheckCircle2 size={14} className="text-white" />}
                          </button>

                          <div className={cn(
                            "px-6 py-5 flex items-center justify-between border-b border-black/5",
                            category.color === "blue" ? "bg-blue-50/30" :
                            category.color === "purple" ? "bg-purple-50/30" :
                            category.color === "emerald" ? "bg-emerald-50/30" :
                            category.color === "orange" ? "bg-orange-50/30" :
                            category.color === "pink" ? "bg-pink-50/30" :
                            "bg-indigo-50/30"
                          )}>
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg",
                                category.color === "blue" ? "bg-blue-500 shadow-blue-500/20" :
                                category.color === "purple" ? "bg-purple-500 shadow-purple-500/20" :
                                category.color === "emerald" ? "bg-emerald-500 shadow-emerald-500/20" :
                                category.color === "orange" ? "bg-orange-500 shadow-orange-500/20" :
                                category.color === "pink" ? "bg-pink-500 shadow-pink-500/20" :
                                "bg-indigo-500 shadow-indigo-500/20"
                              )}>
                                <category.icon size={20} />
                              </div>
                              <div>
                                <h5 className="font-black text-sm text-gray-900 leading-tight pr-8">{category.label}</h5>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  {filtered.length} registros
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex-1 p-6 bg-gray-50/30">
                            {filtered.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-2 opacity-30">
                                <category.icon size={32} />
                                <p className="text-[10px] font-bold uppercase tracking-widest">Nenhum registro</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Última Atualização</span>
                                    {lastUpdate && (lastUpdate.mode === "client_response" || lastUpdate.content.includes("[RESPOSTA AO CLIENTE]")) && (
                                      <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-tighter">Resposta</span>
                                    )}
                                    {lastUpdate && (lastUpdate.mode === "group_update" && !lastUpdate.content.includes("[RESPOSTA AO CLIENTE]")) && (
                                      <span className="bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-tighter">Envio</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-bold text-gray-400">
                                    {lastUpdate.createdAt?.toDate ? lastUpdate.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(lastUpdate.createdAt).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm relative overflow-hidden">
                                  <div className="prose prose-sm max-w-none text-[11px] text-gray-600 line-clamp-3 leading-relaxed italic">
                                    <ReactMarkdown>
                                      {lastUpdate.content
                                        .replace("[RESPOSTA AO CLIENTE] ", "")
                                        .replace("[ENVIO DE MENSAGEM] ", "")}
                                    </ReactMarkdown>
                                  </div>
                                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
                                </div>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => {
                                      setSelectedHistoryRecord(lastUpdate);
                                      setIsHistoryDetailModalOpen(true);
                                    }}
                                    className="flex-1 py-2.5 bg-white border border-black/5 text-gray-500 hover:text-emerald-600 hover:border-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Ver Detalhes
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setSelectedCategoryForModal(category);
                                      setIsCategoryHistoryModalOpen(true);
                                    }}
                                    className="px-4 py-2.5 bg-white text-gray-400 hover:text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-black/5 hover:border-emerald-100"
                                  >
                                    Ver Todos
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Mode Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { 
                id: "communication", 
                title: "Comunicado grupo", 
                description: "Visão executiva para histórico do projeto.", 
                icon: LayoutList, 
                color: "emerald",
                action: "Acessar"
              },
              { 
                id: "account_actions", 
                title: "Ações da conta", 
                description: "Análise estratégica de tarefas e ajustes realizados.", 
                icon: Briefcase, 
                color: "blue",
                action: "Criar"
              },
              { 
                id: "group_update", 
                title: "Enviar mensagem", 
                description: "Gere mensagens de atualização e feedback estratégico para seus clientes.", 
                icon: Send, 
                color: "purple",
                action: "Escrever"
              },
              { 
                id: "client_response", 
                title: "Responder mensagem cliente", 
                description: "Você responderá a uma mensagem do cliente com insights.", 
                icon: MessageCircle, 
                color: "orange",
                action: "Responder",
                extra: "insights"
              },
              { 
                id: "meeting_summary", 
                title: "Análise estratégica de reunião", 
                description: "Gere uma análise estratégica da transcrição da reunião.", 
                icon: Calendar, 
                color: "blue",
                action: "Analisar",
                extra: "transcrição"
              },
              { 
                id: "sales_analyzer", 
                title: "Analisador de Vendas para WhatsApp", 
                description: "Análise estratégica de conversas para aumento de conversão.", 
                icon: MessageCircle, 
                color: "orange",
                action: "Analisar",
                extra: "conversas"
              },
              { 
                id: "ad_copy_generator", 
                title: "Gerador de Copy para Anúncios", 
                description: "Crie anúncios de alta conversão para Google e Meta Ads.", 
                icon: Megaphone, 
                color: "pink",
                action: "Gerar",
                extra: "anúncios"
              }
            ].map((item) => (
              <div 
                key={`mode-select-${item.id}`}
                onClick={() => setMode(item.id as SummaryMode)}
                className={cn(
                  "bg-white rounded-[32px] p-8 border transition-all cursor-pointer flex flex-col justify-between min-h-[280px] group",
                  mode === item.id 
                    ? "border-emerald-500 ring-1 ring-emerald-500 shadow-lg" 
                    : "border-black/5 hover:shadow-md hover:border-emerald-200"
                )}
              >
                <div className="space-y-6">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg",
                    item.color === "emerald" ? "bg-emerald-500 shadow-emerald-500/20" :
                    item.color === "blue" ? "bg-blue-500 shadow-blue-500/20" :
                    item.color === "purple" ? "bg-purple-500 shadow-purple-500/20" :
                    item.color === "pink" ? "bg-pink-500 shadow-pink-500/20" :
                    "bg-orange-500 shadow-orange-500/20"
                  )}>
                    <item.icon size={24} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-gray-900">{item.title}</h3>
                    {item.extra && <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{item.extra}</p>}
                    <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
                  </div>
                </div>
                <div className="pt-6 flex items-center gap-2 text-sm font-bold text-emerald-600 group-hover:gap-3 transition-all">
                  {item.action}
                  <ChevronRight size={16} />
                </div>
              </div>
            ))}
          </div>

          {/* Input Area - Only visible when a mode is selected */}
          {mode && (
            <div className="space-y-8 animate-in slide-in-from-top-4 duration-500">
              <div className="bg-white rounded-[32px] shadow-sm border border-black/5 overflow-hidden transition-all duration-300 focus-within:shadow-md focus-within:border-emerald-200">
                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        mode === "ad_copy_generator" ? "bg-pink-100 text-pink-600" :
                        mode === "sales_analyzer" ? "bg-emerald-100 text-emerald-600" :
                        mode === "meeting_summary" ? "bg-blue-100 text-blue-600" :
                        mode === "group_update" ? "bg-emerald-100 text-emerald-600" :
                        mode === "account_actions" ? "bg-purple-100 text-purple-600" :
                        mode === "communication" ? "bg-blue-100 text-blue-600" :
                        "bg-orange-100 text-orange-600"
                      )}>
                        {mode === "communication" ? <LayoutList size={20} /> :
                         mode === "account_actions" ? <Briefcase size={20} /> :
                         mode === "group_update" ? <Sparkles size={20} /> :
                         mode === "meeting_summary" ? <Calendar size={20} /> :
                         mode === "sales_analyzer" ? <BarChart3 size={20} /> :
                         mode === "ad_copy_generator" ? <Sparkles size={20} /> :
                         <MessageCircle size={20} />}
                      </div>
                      <h4 className="font-bold text-lg">
                        {mode === "communication" ? "Comunicado grupo" :
                         mode === "account_actions" ? "Ações da conta" :
                         mode === "group_update" ? "Enviar mensagem" :
                         mode === "meeting_summary" ? "Análise estratégica de reunião" :
                         mode === "sales_analyzer" ? "Analisador de Vendas para WhatsApp" :
                         mode === "ad_copy_generator" ? "Gerador de Copy para Anúncios" :
                         "Responder mensagem cliente"}
                      </h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setMode(null)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Fechar"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {mode === "ad_copy_generator" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-[#9e9e9e] flex items-center gap-2">
                            <ChevronRight size={14} className="text-emerald-500" />
                            Plataforma
                          </label>
                          <div className="flex gap-2">
                            {["Google Ads", "Meta Ads"].map((p) => (
                              <button
                                key={`platform-${p}`}
                                onClick={() => setAdPlatform(p as any)}
                                className={cn(
                                  "flex-1 py-3 rounded-2xl text-sm font-bold border transition-all",
                                  adPlatform === p 
                                    ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                                    : "bg-gray-50 border-black/5 text-gray-500 hover:bg-gray-100"
                                )}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-[#9e9e9e] flex items-center gap-2">
                            <ChevronRight size={14} className="text-emerald-500" />
                            Idioma
                          </label>
                          <select
                            value={adLanguage}
                            onChange={(e) => setAdLanguage(e.target.value)}
                            className="w-full px-6 py-3 bg-[#f9f9f9] rounded-2xl border-none focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-medium appearance-none cursor-pointer"
                          >
                            <option value="Português (Brasil)">Português (Brasil)</option>
                            <option value="Português (Portugal)">Português (Portugal)</option>
                            <option value="Inglês">Inglês</option>
                            <option value="Espanhol">Espanhol</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {mode === "sales_analyzer" && (
                      <div className="space-y-2">
                        <label htmlFor="niche-input" className="text-xs font-bold uppercase tracking-widest text-[#9e9e9e] flex items-center gap-2">
                          <ChevronRight size={14} className="text-emerald-500" />
                          Nicho de Atuação
                        </label>
                        <input
                          id="niche-input"
                          type="text"
                          className="w-full px-6 py-4 bg-[#f9f9f9] rounded-2xl border-none focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-medium"
                          placeholder="Ex: Estética, Infoprodutos, Imobiliária..."
                          value={niche}
                          onChange={(e) => setNiche(e.target.value)}
                        />
                      </div>
                    )}

                    <label htmlFor="chat-input" className="text-xs font-bold uppercase tracking-widest text-[#9e9e9e] flex items-center gap-2">
                      <ChevronRight size={14} className="text-emerald-500" />
                      {mode === "client_response" 
                        ? "O que você quer dizer ao cliente? (Texto, Áudio ou PDF)" 
                        : mode === "meeting_summary"
                          ? "Cole a transcrição da reunião aqui"
                          : mode === "sales_analyzer"
                            ? "Objetivo do atendimento ou conversas do WhatsApp"
                            : mode === "ad_copy_generator"
                              ? "Produto/Serviço (Texto, Link ou Imagem)"
                              : mode === "account_actions" || mode === "group_update" 
                                ? "Cole a conversa ou suba arquivos (Print, PDF, Áudio)" 
                                : "Cole a conversa ou suba arquivos aqui"}
                    </label>
                    
                    <div className="relative">
                      <textarea
                        id="chat-input"
                        className="w-full h-64 p-6 bg-[#f9f9f9] rounded-[24px] border-none focus:ring-2 focus:ring-emerald-500/20 resize-none font-mono text-sm leading-relaxed outline-none transition-all"
                        placeholder={mode === "client_response"
                          ? "Ex: O cliente está preocupado com o ROAS. Diga que estamos ajustando os criativos e que o acompanhamento é diário..."
                          : mode === "meeting_summary"
                            ? "Cole aqui a transcrição completa da reunião..."
                            : mode === "sales_analyzer"
                              ? "Descreva seu objetivo com o script ou cole aqui as conversas..."
                              : mode === "ad_copy_generator"
                                ? "Descreva o produto, cole o link da página de vendas ou anexe um print do criativo..."
                                : mode === "account_actions" || mode === "group_update"
                                  ? "Cole o log da conversa ou suba um print/PDF do Meta/Google Ads..." 
                                  : "[10:30, 21/03/2024] João: Vamos marcar a reunião?..."}
                        value={mode === "ad_copy_generator" ? adProductInfo : chatTexts[mode]}
                        onChange={(e) => {
                          if (mode === "ad_copy_generator") {
                            setAdProductInfo(e.target.value);
                          } else {
                            setChatTexts(prev => ({ ...prev, [mode]: e.target.value }));
                          }
                        }}
                      />

                      {/* Transcribing Indicator Overlay */}
                      {isTranscribing && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-[24px] flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300 z-10">
                          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                            <Loader2 className="animate-spin" size={24} />
                          </div>
                          <p className="text-sm font-bold text-emerald-700">Transcrevendo áudio...</p>
                        </div>
                      )}

                      {/* Recording Indicator Overlay */}
                      {isRecording && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-[24px] flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300 z-10">
                          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 animate-pulse">
                            <Mic size={32} />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-gray-900">Gravando áudio...</p>
                            <p className="text-xs text-gray-500">Clique no botão abaixo para parar</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-gray-50 text-gray-600 rounded-2xl text-sm font-bold cursor-pointer hover:bg-gray-100 transition-all border border-black/5">
                        <ImageIcon size={18} />
                        <span>Print</span>
                        <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                      </label>
                      <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-gray-50 text-gray-600 rounded-2xl text-sm font-bold cursor-pointer hover:bg-gray-100 transition-all border border-black/5">
                        <FileText size={18} />
                        <span>PDF</span>
                        <input type="file" className="hidden" accept="application/pdf" multiple onChange={handlePdfUpload} />
                      </label>
                      <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-gray-50 text-gray-600 rounded-2xl text-sm font-bold cursor-pointer hover:bg-gray-100 transition-all border border-black/5">
                        <Paperclip size={18} />
                        <span>Anexar Áudio</span>
                        <input type="file" className="hidden" accept="audio/*" onChange={handleAudioUpload} />
                      </label>
                      <button 
                        onClick={isRecording ? stopRecording : startRecording}
                        className={cn(
                          "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all border",
                          isRecording 
                            ? "bg-red-50 text-red-600 border-red-100 animate-pulse" 
                            : "bg-gray-50 text-gray-600 border-black/5 hover:bg-gray-100"
                        )}
                      >
                        {isRecording ? <Square size={18} /> : <Mic size={18} />}
                        <span>{isRecording ? "Parar" : "Gravar Áudio"}</span>
                      </button>
                    </div>

                    <button
                      onClick={mode === "ad_copy_generator" ? handleGenerateAdCopy : handleSummarize}
                      disabled={
                        mode === "ad_copy_generator" 
                          ? isGeneratingAdCopy || (!adProductInfo.trim() && images[mode].length === 0)
                          : loading || (!chatTexts[mode].trim() && images[mode].length === 0 && !audios[mode] && pdfs[mode].length === 0)
                      }
                      className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none"
                    >
                      {(loading || isGeneratingAdCopy) ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={20} />
                          <span>{mode === "ad_copy_generator" ? "Gerar Anúncios" : "Gerar"}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Upload Previews */}
                  {(images[mode].length > 0 || audios[mode] || pdfs[mode].length > 0) && (
                    <div className="flex flex-wrap gap-4 animate-in fade-in slide-in-from-bottom-2">
                      {images[mode].map((img, idx) => (
                        <div key={`img-${idx}`} className="relative group">
                          <img src={img.preview} alt="Upload" className="w-24 h-24 object-cover rounded-2xl border border-black/5 shadow-sm" referrerPolicy="no-referrer" />
                          <button 
                            onClick={() => setImages(prev => ({
                              ...prev,
                              [mode]: prev[mode].filter((_, i) => i !== idx)
                            }))} 
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {audios[mode] && (
                        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 relative group">
                          <Mic size={16} />
                          <span className="text-xs font-bold max-w-[150px] truncate">{audios[mode]!.fileName}</span>
                          <button 
                            onClick={() => setAudios(prev => ({ ...prev, [mode]: null }))} 
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                      {pdfs[mode].map((pdf, idx) => (
                        <div key={`pdf-${idx}`} className="flex items-center gap-3 px-4 py-2 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100 relative group">
                          <FileText size={16} />
                          <span className="text-xs font-bold max-w-[150px] truncate">{pdf.fileName}</span>
                          <button 
                            onClick={() => setPdfs(prev => ({
                              ...prev,
                              [mode]: prev[mode].filter((_, i) => i !== idx)
                            }))} 
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
            <Info className="shrink-0 mt-0.5" size={18} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Results Section */}
        {summaries[mode] && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold tracking-tight">
                    {mode === "account_actions" 
                      ? "Ações Específicas da Conta" 
                      : mode === "group_update"
                        ? "Enviar mensagem de atualização"
                        : mode === "client_response"
                          ? "Responder Mensagem"
                          : mode === "meeting_summary"
                            ? "Análise Estratégica de Reunião"
                            : mode === "sales_analyzer"
                              ? "Análise de Vendas WhatsApp"
                              : mode === "ad_copy_generator"
                                ? "Copy de Anúncio Gerada"
                                : "Comunicado no grupo"}
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={handleNewSummarization}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white border border-black/5 hover:bg-gray-50 text-[#1a1a1a] transition-all"
                >
                  <PlusCircle size={16} />
                  Novo
                </button>
                
                {mode === "sales_analyzer" ? (
                  <>
                    <button 
                      onClick={handleCopy}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                        copied 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                      )}
                    >
                      {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                      {copied ? "Copiado!" : "Copiar análise (WhatsApp)"}
                    </button>
                    <button 
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 shadow-sm transition-all"
                    >
                      <FileDown size={16} />
                      Baixar PDF
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={handleCopy}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                      copied 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                    )}
                  >
                        {copied ? (
                          <>
                            <CheckCircle2 size={16} />
                            Copiado!
                          </>
                        ) : (
                          <>
                            <Copy size={16} />
                            {mode === "group_update" || mode === "client_response" || mode === "meeting_summary"
                              ? "Copiar para WhatsApp" 
                              : mode === "communication" 
                                ? "Copiar comunicado" 
                                : mode === "ad_copy_generator"
                                  ? "Copiar Copy"
                                  : "Copiar ações realizadas"}
                          </>
                        )}
                  </button>
                )}
              </div>
            </div>
            <div 
              ref={resultRef}
              className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 prose prose-emerald max-w-none markdown-body"
            >
              {mode === "sales_analyzer" ? (
                <div className="space-y-8">
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                    <h4 className="text-blue-900 font-bold mb-4 flex items-center gap-2">
                      <FileText size={18} />
                      Versão Completa (PDF)
                    </h4>
                    <ReactMarkdown>
                      {summaries[mode]?.split("[SPLIT_VERSION]")[0]
                        ?.replace(/^PARTE 1:.*$/gim, "")
                        ?.replace(/^VERSÃO PDF.*$/gim, "")
                        ?.replace(/^Esta versão deve ser.*$/gim, "")
                        ?.trim() || ""}
                    </ReactMarkdown>
                  </div>
                  <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <h4 className="text-emerald-900 font-bold mb-4 flex items-center gap-2">
                      <MessageCircle size={18} />
                      Versão WhatsApp (Resumida)
                    </h4>
                    <ReactMarkdown>
                      {summaries[mode]?.split("[SPLIT_VERSION]")[1]
                        ?.replace(/^PARTE 2:.*$/gim, "")
                        ?.replace(/^VERSÃO WHATSAPP.*$/gim, "")
                        ?.replace(/^Esta versão deve ser.*$/gim, "")
                        ?.trim() || ""}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <ReactMarkdown>{summaries[mode] || ""}</ReactMarkdown>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        <section className="bg-emerald-50 rounded-3xl p-8 border border-emerald-100 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
              <Info size={24} />
            </div>
            <h3 className="text-xl font-bold text-emerald-900">Como otimizar seu trabalho</h3>
          </div>
          <div className="grid sm:grid-cols-4 gap-6">
            {mode === "sales_analyzer" ? [
              { step: "1", title: "Prints ou Objetivo", desc: "Suba até 10 prints ou descreva seu objetivo de atendimento." },
              { step: "2", title: "Defina o Nicho", desc: "Informe o nicho para uma análise contextualizada." },
              { step: "3", title: "Análise Estratégica", desc: "A IA identifica erros ou cria uma estrutura do zero." },
              { step: "4", title: "Scripts Prontos", desc: "Receba scripts humanizados e de alta conversão." }
            ].map((item) => (
              <div key={`step-sa-${item.step}`} className="space-y-2">
                <div className="text-3xl font-bold text-emerald-200">{item.step}</div>
                <h4 className="font-bold text-emerald-900">{item.title}</h4>
                <p className="text-sm text-emerald-700/80 leading-relaxed">{item.desc}</p>
              </div>
            )) : [
              { step: "1", title: "Prints de Ads", desc: "Tire prints das métricas do Meta ou Google Ads." },
              { step: "2", title: "Áudios do Cliente", desc: "Anexe áudios com briefings ou feedbacks para transcrição automática." },
              { step: "3", title: "Contexto Extra", desc: "Cole conversas de texto para complementar a análise." },
              { step: "4", title: "Insights Prontos", desc: "Gere análises estratégicas em segundos." }
            ].map((item) => (
              <div key={`step-gen-${item.step}`} className="space-y-2">
                <div className="text-3xl font-bold text-emerald-200">{item.step}</div>
                <h4 className="font-bold text-emerald-900">{item.title}</h4>
                <p className="text-sm text-emerald-700/80 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

              </motion.div>
            )}
          </AnimatePresence>

          {/* Clients Tab Section */}
          {isClientsTabOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-none sm:rounded-[40px] p-6 sm:p-10 w-full h-full sm:max-w-6xl sm:max-h-[90vh] overflow-hidden shadow-2xl border border-black/5 flex flex-col relative"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 shadow-sm">
                      <Users size={28} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900">Gestão de Clientes</h3>
                      <p className="text-sm text-gray-500 font-medium">Visualize e gerencie sua carteira de clientes estrategicamente.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setIsClientModalOpen(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      <PlusCircle size={18} />
                      Novo Cliente
                    </button>
                    <button onClick={() => setIsClientsTabOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl transition-all">
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2">
                  {clients.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40 py-20">
                      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                        <Users size={48} />
                      </div>
                      <div className="space-y-2">
                        <p className="font-bold text-xl uppercase tracking-widest">Nenhum cliente cadastrado</p>
                        <p className="text-sm max-w-xs mx-auto">Comece adicionando seu primeiro cliente para gerenciar métricas e históricos.</p>
                      </div>
                      <button 
                        onClick={() => setIsClientModalOpen(true)}
                        className="px-8 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        Cadastrar Primeiro Cliente
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
                      {clients.sort((a, b) => a.name.localeCompare(b.name)).map((client) => (
                        <div 
                          key={`client-tab-card-${client.id}`}
                          className="bg-white rounded-3xl border border-black/5 p-6 hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/5 transition-all group relative overflow-hidden flex flex-col"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-all flex gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingClientId(client.id);
                                setEditingClientName(client.name);
                                setNewClientNiche(client.niche || "");
                                setNewClientLogo(client.logo || null);
                                setNewClientPlatforms(client.platforms || ["Google", "Meta"]);
                                setNewClientInvestment(client.investmentValue?.toString() || "");
                                setNewClientCurrency(client.currency || "BRL");
                                setIsEditingClient(true);
                                setIsClientModalOpen(true);
                              }}
                              className="p-2 bg-white text-blue-600 rounded-xl shadow-lg hover:bg-blue-50 transition-all border border-blue-100"
                              title="Editar Cliente"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClient(client.id);
                              }}
                              className="p-2 bg-white text-red-600 rounded-xl shadow-lg hover:bg-red-50 transition-all border border-red-100"
                              title="Excluir Cliente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-black/5 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform duration-500">
                              {client.logo ? (
                                <img src={client.logo} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-gray-300">
                                  <ImageIcon size={32} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-gray-900 truncate text-lg">{client.name}</h4>
                              <p className="text-xs text-purple-600 font-bold uppercase tracking-widest truncate">{client.niche || "Nicho não definido"}</p>
                            </div>
                          </div>

                          <div className="space-y-4 flex-1">
                            <div className="flex flex-wrap gap-2">
                              {client.platforms?.map((p: string) => {
                                const platformDaily = (client.platformInvestments?.[p] || 0) / 30;
                                return (
                                  <div key={`${client.id}-plat-${p}`} className="flex flex-col gap-1 px-3 py-2 bg-gray-50 rounded-xl border border-black/5 min-w-[100px]">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{p}</span>
                                    <span className="text-xs font-bold text-gray-900">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: client.currency || 'BRL' }).format(platformDaily)}/dia
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="p-4 bg-gray-50 rounded-2xl border border-black/5 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Investimento Mensal</span>
                                <span className="text-sm font-black text-gray-900">
                                  {client.investmentValue ? 
                                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: client.currency || 'BRL' }).format(client.investmentValue) : 
                                    "---"
                                  }
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 pt-4 border-t border-black/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", client.status === 'inactive' ? "bg-red-500" : "bg-emerald-500 animate-pulse")}></div>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {client.status === 'inactive' ? "Inativo" : "Ativo"}
                              </span>
                            </div>
                            <button 
                              onClick={() => {
                                handleSelectClient(client.id);
                                setIsClientsTabOpen(false);
                              }}
                              className="text-[10px] font-black text-purple-600 uppercase tracking-widest hover:underline"
                            >
                              Selecionar Cliente
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {/* Footer */}
        <footer className="pt-12 pb-6 border-t border-black/5 text-center space-y-4">
          <p className="text-sm text-[#9e9e9e]">
            Privacidade em primeiro lugar: Suas conversas e imagens são processadas com segurança.
          </p>
          <p className="text-xs text-[#9e9e9e]/60 font-medium">
            Criado e desenvolvido por <span className="text-emerald-500">@gabrieldotrafego</span>
          </p>
          <div className="flex justify-center gap-6">
            <a href="#" className="text-xs font-semibold uppercase tracking-widest text-[#9e9e9e] hover:text-emerald-500 transition-colors">Termos</a>
            <a href="#" className="text-xs font-semibold uppercase tracking-widest text-[#9e9e9e] hover:text-emerald-500 transition-colors">Privacidade</a>
            <a href="#" className="text-xs font-semibold uppercase tracking-widest text-[#9e9e9e] hover:text-emerald-500 transition-colors">Contato</a>
          </div>
        </footer>
        {/* Confirmation Modal */}
        <ConfirmationModal 
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          type={confirmModal.type}
          onConfirm={() => {
            confirmModal.onConfirm();
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
          }}
          onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        />

        <AnimatePresence>
          {isProfileModalOpen && (
            <ProfileModal 
              isOpen={isProfileModalOpen}
              onClose={() => setIsProfileModalOpen(false)}
              displayName={tempDisplayName}
              setDisplayName={setTempDisplayName}
              profilePic={tempProfilePic}
              handleProfilePicChange={(e) => handleProfilePicUpload(e, true)}
              onSave={handleSaveProfile}
              loading={authLoading}
              error={authError}
            />
          )}

          {(isClientModalOpen || isEditingClient) && (
            <ClientModal 
              isOpen={isClientModalOpen || isEditingClient}
              onClose={() => {
                setIsClientModalOpen(false);
                setIsEditingClient(false);
                setNewClientName("");
                setNewClientNiche("");
                setNewClientLogo(null);
                setNewClientPlatforms(["Google", "Meta"]);
                setNewClientInvestment("");
                setNewClientPlatformInvestments({});
                setEditingClientPlatformInvestments({});
                setNewClientCurrency("BRL");
                setEditingClientId("");
                setEditingClientName("");
              }}
              isEditing={isEditingClient}
              clientName={isEditingClient ? editingClientName : newClientName}
              setClientName={isEditingClient ? setEditingClientName : setNewClientName}
              niche={newClientNiche}
              setNiche={setNewClientNiche}
              logo={newClientLogo}
              setLogo={setNewClientLogo}
              platforms={newClientPlatforms}
              setPlatforms={setNewClientPlatforms}
              investment={newClientInvestment}
              setInvestment={setNewClientInvestment}
              platformInvestments={isEditingClient ? editingClientPlatformInvestments : newClientPlatformInvestments}
              setPlatformInvestments={isEditingClient ? setEditingClientPlatformInvestments : setNewClientPlatformInvestments}
              status={isEditingClient ? editingClientStatus : newClientStatus}
              setStatus={isEditingClient ? setEditingClientStatus : setNewClientStatus}
              currency={newClientCurrency}
              setCurrency={setNewClientCurrency}
              onSave={isEditingClient ? handleEditClient : handleAddClient}
            />
          )}

          {isClientHistoryModalOpen && clientForHistoryModal && (
            <ClientHistoryModal 
              isOpen={isClientHistoryModalOpen}
              onClose={() => setIsClientHistoryModalOpen(false)}
              client={clientForHistoryModal}
              history={clientHistories.filter(h => h.clientId === clientForHistoryModal.id)}
              onViewDetail={(record) => {
                setSelectedHistoryRecord(record);
                setIsHistoryDetailModalOpen(true);
              }}
            />
          )}

          {isCategoryHistoryModalOpen && selectedCategoryForModal && (
            <CategoryHistoryModal 
              isOpen={isCategoryHistoryModalOpen}
              onClose={() => setIsCategoryHistoryModalOpen(false)}
              category={selectedCategoryForModal}
              history={clientHistories.filter(h => h.mode === selectedCategoryForModal.id || (selectedCategoryForModal.id === "group_update" && h.mode === "client_response"))}
              onViewDetail={(record) => {
                setSelectedHistoryRecord(record);
                setIsHistoryDetailModalOpen(true);
              }}
            />
          )}

          {isHistoryDetailModalOpen && selectedHistoryRecord && (
            <HistoryDetailModal 
              isOpen={isHistoryDetailModalOpen}
              onClose={() => setIsHistoryDetailModalOpen(false)}
              record={selectedHistoryRecord}
            />
          )}

          {isSummaryOptionsModalOpen && (
            <SummaryOptionsModal 
              isOpen={isSummaryOptionsModalOpen}
              onClose={() => setIsSummaryOptionsModalOpen(false)}
              summaryOption={summaryOption}
              setSummaryOption={setSummaryOption}
              selectedSummaryModes={selectedSummaryModes}
              setSelectedSummaryModes={setSelectedSummaryModes}
              onExecute={executeSummarizeHistory}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
    </ErrorBoundary>
  );
}

const ConfirmationModal = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  type 
}: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void; 
  type: 'danger' | 'warning' 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-black/5 space-y-6"
      >
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
          type === 'danger' ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
        )}>
          <AlertTriangle size={32} />
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={onConfirm}
            className={cn(
              "w-full py-3 rounded-full font-bold text-white transition-all shadow-lg",
              type === 'danger' ? "bg-red-600 hover:bg-red-700 shadow-red-500/20" : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20"
            )}
          >
            Confirmar
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 bg-gray-100 text-gray-600 rounded-full font-bold hover:bg-gray-200 transition-all"
          >
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const ProfileModal = ({ 
  isOpen, 
  onClose, 
  displayName, 
  setDisplayName, 
  profilePic, 
  handleProfilePicChange, 
  onSave, 
  loading, 
  error 
}: any) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-black/5 space-y-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold text-gray-900">Perfil do Usuário</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-emerald-500/20 group-hover:border-emerald-500 transition-all">
                {profilePic ? (
                  <img src={profilePic} alt="Perfil" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-2xl font-bold">
                    {displayName?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 p-2 bg-emerald-500 text-white rounded-full shadow-lg cursor-pointer hover:bg-emerald-600 transition-all">
                <ImageIcon size={16} />
                <input type="file" className="hidden" accept="image/*" onChange={handleProfilePicChange} />
              </label>
            </div>
            <p className="text-xs text-gray-500 font-medium">Clique no ícone para alterar a foto</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Nome de Exibição</label>
            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-medium"
              placeholder="Seu nome"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-2">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Salvar Alterações"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const ClientModal = ({ 
  isOpen, 
  onClose, 
  isEditing, 
  clientName, 
  setClientName, 
  niche,
  setNiche,
  logo,
  setLogo,
  platforms,
  setPlatforms,
  investment,
  setInvestment,
  platformInvestments,
  setPlatformInvestments,
  status,
  setStatus,
  currency,
  setCurrency,
  onSave 
}: any) => {
  if (!isOpen) return null;

  const [customPlatform, setCustomPlatform] = useState("");

  const investmentValue = Object.values(platformInvestments || {}).reduce((acc: number, curr: any) => acc + (parseFloat(curr) || 0), 0) as number;
  const dailyInvestment = (investmentValue / 30) as number;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePlatform = (p: string) => {
    if (platforms.includes(p)) {
      setPlatforms(platforms.filter((item: string) => item !== p));
      const newInvestments = { ...platformInvestments };
      delete newInvestments[p];
      setPlatformInvestments(newInvestments);
      const total = Object.values(newInvestments).reduce((acc: number, curr: any) => acc + (parseFloat(curr) || 0), 0);
      setInvestment(total.toString());
    } else {
      setPlatforms([...platforms, p]);
    }
  };

  const addCustomPlatform = () => {
    if (customPlatform.trim() && !platforms.includes(customPlatform.trim())) {
      setPlatforms([...platforms, customPlatform.trim()]);
      setCustomPlatform("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl border border-black/5 flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-gray-900">
            {isEditing ? "Editar Cliente" : "Novo Cliente"}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-8 overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Logo do Cliente</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group relative">
                    {logo ? (
                      <>
                        <img src={logo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <button 
                          type="button"
                          onClick={() => setLogo(null)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                        >
                          <Trash2 size={20} />
                        </button>
                      </>
                    ) : (
                      <ImageIcon size={24} className="text-gray-300" />
                    )}
                  </div>
                  <label className="cursor-pointer py-2 px-4 bg-gray-50 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-100 transition-all">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Nome do Cliente</label>
                <input 
                  type="text" 
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-medium"
                  placeholder="Ex: Nome da Empresa"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Nicho de Atuação</label>
                <input 
                  type="text" 
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-medium"
                  placeholder="Ex: E-commerce de Moda"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Status do Cliente</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('active')}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                      status === 'active' ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full", status === 'active' ? "bg-white" : "bg-emerald-500")}></div>
                    Ativo
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('inactive')}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                      status === 'inactive' ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full", status === 'inactive' ? "bg-white" : "bg-red-500")}></div>
                    Inativo
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Plataformas de Tráfego</label>
                <div className="flex flex-wrap gap-2">
                  {["Google", "Meta"].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                        platforms.includes(p) ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                  {platforms.filter(p => !["Google", "Meta"].includes(p)).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input 
                    type="text"
                    value={customPlatform}
                    onChange={(e) => setCustomPlatform(e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-50 rounded-xl border-none text-sm outline-none"
                    placeholder="Outra plataforma..."
                  />
                  <button 
                    type="button"
                    onClick={addCustomPlatform}
                    className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all"
                  >
                    <PlusCircle size={20} />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Investimento Mensal</label>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Moeda</label>
                  <select 
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 rounded-2xl border-none outline-none font-bold text-gray-600"
                  >
                    <option value="BRL">R$ (BRL)</option>
                    <option value="USD">$ (USD)</option>
                    <option value="EUR">€ (EUR)</option>
                    <option value="GBP">£ (GBP)</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Distribuição por Plataforma</label>
                  {platforms.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Selecione ao menos uma plataforma para definir o investimento.</p>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {platforms.map((p: string) => (
                        <div key={p} className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl border border-black/5">
                          <span className="text-xs font-bold text-gray-600 min-w-[80px] truncate">{p}</span>
                          <div className="flex-1 flex gap-2">
                            <span className="text-gray-400 font-bold self-center text-xs">{currency}</span>
                            <input 
                              type="number" 
                              value={platformInvestments[p] || ""}
                              onChange={(e) => {
                                const newInvestments = { ...platformInvestments, [p]: e.target.value };
                                setPlatformInvestments(newInvestments);
                                const total = Object.values(newInvestments).reduce((acc: number, curr: any) => acc + (parseFloat(curr) || 0), 0);
                                setInvestment(total.toString());
                              }}
                              className="w-full bg-white px-4 py-2 rounded-xl border-none focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-medium text-sm"
                              placeholder="0,00"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 rounded-3xl p-6 space-y-4 border border-black/5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">Total Mensal</span>
                    <span className="font-bold text-gray-900">
                      {currency} {(investmentValue as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <div className="h-px bg-gray-200" />

                  <div className="bg-white rounded-2xl p-4 flex justify-between items-center shadow-sm">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Diário</span>
                    <span className="font-black text-emerald-500">
                      {currency} {(dailyInvestment as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={!clientName.trim()}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
            >
              {isEditing ? "Salvar Alterações" : "Adicionar Cliente"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const HistoryDetailModal = ({ isOpen, onClose, record }: any) => {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl border border-black/5 flex flex-col"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <HistoryIcon size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Detalhes do Registro</h3>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">
                {record.createdAt?.toDate ? record.createdAt.toDate().toLocaleString('pt-BR') : new Date(record.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          <div className="p-6 bg-gray-50 rounded-2xl border border-black/5 prose prose-emerald max-w-none">
            <ReactMarkdown>{record.content}</ReactMarkdown>
          </div>
        </div>

        <div className="pt-6 border-t border-black/5 flex justify-end">
          <button 
            onClick={() => {
              navigator.clipboard.writeText(record.content);
              onClose();
            }}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
          >
            <Copy size={18} />
            Copiar Conteúdo
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const ClientHistoryModal = ({ isOpen, onClose, client, history, onViewDetail }: any) => {
  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-black/5 flex flex-col"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
              <Users size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{client.name}</h3>
              <p className="text-sm text-gray-500 font-medium">Histórico completo de interações e análises</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {history.length === 0 ? (
            <div className="py-20 text-center space-y-4 opacity-30">
              <HistoryIcon size={48} className="mx-auto" />
              <p className="font-bold uppercase tracking-widest text-sm">Nenhum registro encontrado</p>
            </div>
          ) : (
            history.sort((a: any, b: any) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
              return dateB.getTime() - dateA.getTime();
            }).map((record: any, idx: number) => (
              <div 
                key={`client-hist-modal-${record.id}-${idx}`}
                className="p-6 bg-gray-50 rounded-2xl border border-black/5 hover:border-emerald-200 transition-all group cursor-pointer"
                onClick={() => onViewDetail(record)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter",
                      record.mode === "client_response" ? "bg-orange-100 text-orange-700" :
                      record.mode === "group_update" ? "bg-emerald-100 text-emerald-700" :
                      record.mode === "account_actions" ? "bg-blue-100 text-blue-700" :
                      record.mode === "sales_analyzer" ? "bg-emerald-100 text-emerald-700" :
                      "bg-indigo-100 text-indigo-700"
                    )}>
                      {record.mode === "client_response" ? "Resposta" :
                       record.mode === "group_update" ? "Envio" :
                       record.mode === "account_actions" ? "Ações" :
                       record.mode === "meeting_summary" ? "Reunião" :
                       record.mode === "sales_analyzer" ? "Vendas" : "Comunicado"}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">
                      {record.createdAt?.toDate ? record.createdAt.toDate().toLocaleString('pt-BR') : new Date(record.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </div>
                <div className="prose prose-sm max-w-none text-gray-600 line-clamp-2 text-xs leading-relaxed">
                  <ReactMarkdown>{record.content}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

const CategoryHistoryModal = ({ isOpen, onClose, category, history, onViewDetail }: any) => {
  if (!isOpen || !category) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-black/5 flex flex-col"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg",
              category.color === "blue" ? "bg-blue-500 shadow-blue-500/20" :
              category.color === "purple" ? "bg-purple-500 shadow-purple-500/20" :
              category.color === "emerald" ? "bg-emerald-500 shadow-emerald-500/20" :
              "bg-indigo-500 shadow-indigo-500/20"
            )}>
              <category.icon size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{category.label}</h3>
              <p className="text-sm text-gray-500 font-medium">Histórico consolidado de todos os clientes</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {history.length === 0 ? (
            <div className="py-20 text-center space-y-4 opacity-30">
              <category.icon size={48} className="mx-auto" />
              <p className="font-bold uppercase tracking-widest text-sm">Nenhum registro nesta categoria</p>
            </div>
          ) : (
            history.sort((a: any, b: any) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
              return dateB.getTime() - dateA.getTime();
            }).map((record: any, idx: number) => (
              <div 
                key={`cat-hist-modal-${record.id}-${idx}`}
                className="p-6 bg-gray-50 rounded-2xl border border-black/5 hover:border-emerald-200 transition-all group cursor-pointer"
                onClick={() => onViewDetail(record)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                      {record.clientName || "Cliente"}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">
                      {record.createdAt?.toDate ? record.createdAt.toDate().toLocaleString('pt-BR') : new Date(record.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </div>
                <div className="prose prose-sm max-w-none text-gray-600 line-clamp-2 text-xs leading-relaxed">
                  <ReactMarkdown>{record.content}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

const SummaryOptionsModal = ({ 
  isOpen, 
  onClose, 
  summaryOption, 
  setSummaryOption, 
  selectedSummaryModes, 
  setSelectedSummaryModes, 
  onExecute 
}: any) => {
  if (!isOpen) return null;

  const categories = [
    { id: "communication", label: "Comunicado grupo", icon: LayoutList, color: "emerald" },
    { id: "account_actions", label: "Ações da conta", icon: Briefcase, color: "blue" },
    { id: "group_update", label: "Enviar mensagem", icon: Sparkles, color: "purple" },
    { id: "meeting_summary", label: "Análise estratégica de reunião", icon: Calendar, color: "blue" },
    { id: "sales_analyzer", label: "Analisador de WhatsApp", icon: MessageCircle, color: "orange" },
    { id: "ad_copy_generator", label: "Gerador de Copy para anúncios", icon: Megaphone, color: "pink" }
  ];

  const toggleMode = (id: string) => {
    if (selectedSummaryModes.includes(id)) {
      setSelectedSummaryModes(selectedSummaryModes.filter((m: string) => m !== id));
    } else {
      setSelectedSummaryModes([...selectedSummaryModes, id]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl border border-black/5 space-y-8"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <Sparkles size={20} />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Opções de Resumo</h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">O que deseja resumir?</label>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setSummaryOption("all")}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all text-left space-y-1",
                  summaryOption === "all" ? "border-emerald-500 bg-emerald-50" : "border-black/5 hover:border-emerald-200"
                )}
              >
                <p className="font-bold text-sm">Todo o Histórico</p>
                <p className="text-[10px] text-gray-500">Resume todos os registros do cliente.</p>
              </button>
              <button 
                onClick={() => setSummaryOption("selected")}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all text-left space-y-1",
                  summaryOption === "selected" ? "border-emerald-500 bg-emerald-50" : "border-black/5 hover:border-emerald-200"
                )}
              >
                <p className="font-bold text-sm">Categorias Específicas</p>
                <p className="text-[10px] text-gray-500">Escolha quais tipos de registros incluir.</p>
              </button>
            </div>
          </div>

          {summaryOption === "selected" && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Selecione as Categorias</label>
                <button 
                  onClick={() => {
                    if (selectedSummaryModes.length === categories.length) {
                      setSelectedSummaryModes([]);
                    } else {
                      setSelectedSummaryModes(categories.map(c => c.id));
                    }
                  }}
                  className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline"
                >
                  {selectedSummaryModes.length === categories.length ? "Desmarcar Todos" : "Selecionar Todos"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {categories.map((cat) => (
                  <button 
                    key={`summary-cat-${cat.id}`}
                    onClick={() => toggleMode(cat.id)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-all",
                      selectedSummaryModes.includes(cat.id) ? "border-emerald-200 bg-emerald-50/50" : "border-black/5 hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-white",
                        cat.color === "emerald" ? "bg-emerald-500" :
                        cat.color === "blue" ? "bg-blue-500" :
                        cat.color === "purple" ? "bg-purple-500" :
                        cat.color === "orange" ? "bg-orange-500" :
                        cat.color === "pink" ? "bg-pink-500" : "bg-indigo-500"
                      )}>
                        <cat.icon size={16} />
                      </div>
                      <span className="text-sm font-bold text-gray-700">{cat.label}</span>
                    </div>
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedSummaryModes.includes(cat.id) ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300"
                    )}>
                      {selectedSummaryModes.includes(cat.id) && <CheckCircle2 size={12} />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button 
            onClick={onExecute}
            disabled={summaryOption === "selected" && selectedSummaryModes.length === 0}
            className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
          >
            Gerar Resumo Estratégico
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const ClientSelector = ({ 
  clients, 
  selectedClientId, 
  onSelect,
  onEdit
}: { 
  clients: Client[]; 
  selectedClientId: string; 
  onSelect: (id: string) => void; 
  onEdit: (client: Client) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (c.status === 'active' || !c.status)
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onSelect(id);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative w-full sm:w-80" ref={dropdownRef}>
      <div 
        className={cn(
          "flex items-center gap-2 bg-gray-50 border rounded-2xl px-4 py-2.5 transition-all cursor-text",
          isOpen ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-black/5"
        )}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="bg-transparent border-none outline-none text-sm font-medium w-full placeholder:text-gray-400"
          placeholder={selectedClient ? selectedClient.name : "Buscar ou selecionar cliente..."}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <ChevronDown 
          size={16} 
          className={cn(
            "text-gray-400 transition-transform duration-200 shrink-0 cursor-pointer",
            isOpen && "rotate-180"
          )} 
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-black/5 z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-60 overflow-y-auto p-2">
            {searchTerm === "" && (
              <div
                onClick={() => handleSelect("")}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between group cursor-pointer",
                  selectedClientId === "" 
                    ? "bg-emerald-50 text-emerald-700 font-bold" 
                    : "hover:bg-gray-50 text-gray-700"
                )}
              >
                <span>Remover filtro</span>
                {selectedClientId === "" && (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                )}
              </div>
            )}

            {filteredClients.length > 0 ? (
              filteredClients.map(client => (
                <div key={`client-list-${client.id}`} className="group relative">
                  <div
                    onClick={() => handleSelect(client.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between group cursor-pointer",
                      selectedClientId === client.id 
                        ? "bg-emerald-50 text-emerald-700 font-bold" 
                        : "hover:bg-gray-50 text-gray-700"
                    )}
                  >
                    <span>{client.name}</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(client);
                        }}
                        className="p-1 text-gray-400 hover:text-emerald-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Editar cliente"
                      >
                        <Edit2 size={14} />
                      </button>
                      {selectedClientId === client.id && (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center space-y-2">
                <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400">
                  <Users size={20} />
                </div>
                <p className="text-xs text-gray-500">Nenhum cliente encontrado</p>
              </div>
            )}
          </div>
          
          {searchTerm && filteredClients.length > 0 && (
            <div className="p-2 border-t border-black/5 bg-gray-50/50">
              <p className="text-[10px] text-gray-400 text-center uppercase tracking-wider font-bold">
                Mostrando {filteredClients.length} resultados
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


