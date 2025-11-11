/* global __app_id, __firebase_config */
import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
    getFirestore, doc, collection, query, where, orderBy, onSnapshot,
    addDoc, getDoc, updateDoc, deleteDoc, getDocs, setDoc, limit
} from 'firebase/firestore';
import {
    LogIn, LogOut, Clock, User, Briefcase, RefreshCcw, Loader2, CheckCircle,
    AlertTriangle, XCircle, Pause, Mail, Users, FileText, Edit,
    Trash2, X, File, Send, Search, Plus, Home, MessageSquare, Sun, Moon
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// --- /src/firebase/config.js (Corrigido) ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_apiKey,
  authDomain: process.env.REACT_APP_authDomain,
  projectId: process.env.REACT_APP_projectId,
  storageBucket: process.env.REACT_APP_storageBucket,
  messagingSenderId: process.env.REACT_APP_messagingSenderId,
  appId: process.env.REACT_APP_appId
};

let app, auth, db;
let isFirebaseInitialized = false;
let appId = 'secretaria-educacao-ponto-demo'; // Valor padrão

try {
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        isFirebaseInitialized = true;
        appId = firebaseConfig.appId; // Corrigido para usar appId
    } else {
        console.warn("Configuração do Firebase não encontrada. Usando modo de demonstração.");
        app = {}; auth = {}; db = null;
    }
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
    app = {}; auth = {}; db = null;
}

// --- Constantes ---
const STATUS_COLORS = {
    entrada: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    saida: 'text-slate-700 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600',
    pausa: 'text-amber-700 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    volta: 'text-indigo-700 bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800',
    finished: 'text-slate-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-600',
    pendente: 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800',
    aprovado: 'text-green-700 bg-green-100 dark:bg-green-900/50 dark:text-green-400 border border-green-200 dark:border-green-800',
    reprovado: 'text-red-700 bg-red-100 dark:bg-red-900/50 dark:text-red-400 border border-red-200 dark:border-red-800',
};
const TARGET_DAILY_HOURS_MS = 8 * 60 * 60 * 1000;
const USER_COLLECTION = 'users';
const UNIT_COLLECTION = 'unidades';

// --- Contexts ---
const ThemeContext = createContext();
const AuthContext = createContext();
const GlobalMessageContext = createContext();

// --- /src/hooks/useTheme.js (Simulado) ---
function useTheme() {
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return savedTheme || (prefersDark ? 'dark' : 'light');
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    }, []);

    return { theme, toggleTheme };
}

// --- Providers ---
const ThemeProvider = ({ children }) => {
    const { theme, toggleTheme } = useTheme();
    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [unidades, setUnidades] = useState({});

    // Carregar unidades
    useEffect(() => {
        if (!isFirebaseInitialized) {
            setUnidades({
                'unidade-adm-01': { name: 'Controle e Movimentação (Demo)' },
                'unidade-esc-01': { name: 'Escola Municipal A (Demo)' },
            });
            return;
        }
        const q = query(collection(db, `artifacts/${appId}/public/data/${UNIT_COLLECTION}`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const units = {};
            snapshot.forEach(doc => units[doc.id] = doc.data());
            setUnidades(units);
        });
        return () => unsubscribe();
    }, []);

    // Lógica de autenticação
    useEffect(() => {
        if (!isFirebaseInitialized) {
            setIsLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', USER_COLLECTION, firebaseUser.uid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    setUser({ uid: firebaseUser.uid, ...userSnap.data() });
                } else {
                    console.error("Usuário autenticado não encontrado no Firestore. Fazendo logout.");
                    await signOut(auth);
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSignUp = useCallback(async (nome, email, matricula, password) => {
        if (!isFirebaseInitialized) {
            throw new Error('O cadastro não está disponível no modo de demonstração.');
        }

        try {
            const usersRef = collection(db, 'artifacts', appId, 'public', 'data', USER_COLLECTION);
            const q = query(usersRef, where("matricula", "==", matricula));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                throw new Error("Esta matrícula já está em uso.");
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', USER_COLLECTION, user.uid);
            await setDoc(userDocRef, {
                nome,
                email,
                matricula,
                role: 'servidor',
                unidadeId: null,
                createdAt: new Date(),
            });

        } catch (error) {
            console.error("Firebase sign-up failed:", error);
            if (error.code === 'auth/email-already-in-use') {
                throw new Error("Este email já está em uso.");
            }
            throw new Error(error.message || "Falha ao criar a conta.");
        }
    }, []);

    // ##### FUNÇÃO DE LOGIN MODIFICADA #####
    const handleLogin = useCallback(async (email, password) => {
        if (!isFirebaseInitialized) {
            throw new Error('Email ou senha incorretos.');
        }

        try {
            // A autenticação agora é feita diretamente com o Firebase Auth
            await signInWithEmailAndPassword(auth, email, password);
            // O onAuthStateChanged vai cuidar de buscar os dados do Firestore e atualizar o estado do usuário
        } catch(error) {
             console.error("Firebase login failed:", error);
             // Mensagem de erro genérica para segurança
             throw new Error("Email ou senha incorretos.");
        }
    }, []);

    const handleForgotPassword = useCallback(async (email) => {
        if (!isFirebaseInitialized) {
            throw new Error('A recuperação de senha não está disponível no modo de demonstração.');
        }
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error) {
            console.error("Firebase password reset failed:", error);
            throw new Error("Falha ao enviar o email de recuperação. Verifique o endereço de email.");
        }
    }, []);


    const handleLogout = useCallback(async () => {
        if (isFirebaseInitialized) {
            await signOut(auth);
        }
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        role: user?.role || null,
        userId: user?.uid || null,
        isLoading,
        unidades,
        handleLogin,
        handleLogout,
        handleSignUp,
        handleForgotPassword,
        db,
        auth
    }), [user, isLoading, unidades, handleLogin, handleLogout, handleSignUp, handleForgotPassword]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const GlobalMessageProvider = ({ children }) => {
    const [message, setMessage] = useState(null);
    return (
        <GlobalMessageContext.Provider value={{ message, setMessage }}>
            {children}
        </GlobalMessageContext.Provider>
    );
};

// --- Custom Hooks for Contexts ---
const useThemeContext = () => useContext(ThemeContext);
const useAuthContext = () => useContext(AuthContext);
const useGlobalMessage = () => useContext(GlobalMessageContext);


// --- Components ---
const ThemeToggleButton = () => {
    const { theme, toggleTheme } = useThemeContext();
    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-full bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Alternar tema"
        >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
    );
};

const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-950">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="mt-4 text-lg font-medium text-slate-700 dark:text-slate-300">Carregando sistema...</p>
    </div>
);

const GlobalMessageContainer = () => {
    const { message, setMessage } = useGlobalMessage();
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [message, setMessage]);

    if (!message) return null;

    const baseClasses = "fixed top-5 right-5 w-full max-w-sm z-[100] transition-all duration-300";
    const animationClass = message ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full";

    const typeClasses = {
        success: 'bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-800',
        error: 'bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-800',
        warning: 'bg-yellow-50 border-yellow-300 dark:bg-yellow-950 dark:border-yellow-800',
    };
    const iconMap = {
        success: <CheckCircle className="w-6 h-6 text-green-500" />,
        error: <XCircle className="w-6 h-6 text-red-500" />,
        warning: <AlertTriangle className="w-6 h-6 text-yellow-500" />,
    };

    return (
        <div className={`${baseClasses} ${animationClass}`}>
            <div className={`rounded-lg shadow-lg border p-4 flex items-start space-x-3 ${typeClasses[message.type]}`}>
                {iconMap[message.type]}
                <div className="flex-1">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{message.title}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{message.message}</p>
                </div>
                <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, isLoading }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 transition-opacity animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all animate-in fade-in zoom-in-95">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" /> {title}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mt-2">{message}</p>
                <div className="flex justify-end space-x-3 mt-6">
                    <button onClick={onCancel} className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-gray-700 dark:text-slate-200 dark:hover:bg-gray-600 transition">Cancelar</button>
                    <button onClick={onConfirm} disabled={isLoading} className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:bg-red-400 flex items-center">
                        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

const FileViewerModal = ({ isOpen, onClose, fileUrl, fileName }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Visualizar Anexo</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Nome do arquivo: {fileName}</p>
                <div className="mt-4 p-4 border rounded-lg text-center bg-slate-50 dark:bg-gray-800 dark:border-gray-700">
                    <p className="font-semibold dark:text-slate-200">Visualização de anexo simulada.</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Em um ambiente de produção, o arquivo seria exibido aqui.</p>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-blue-600 hover:underline text-xs break-all">
                        URL simulada: {fileUrl}
                    </a>
                </div>
                <button onClick={onClose} className="mt-6 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Fechar</button>
            </div>
        </div>
    );
};

// ##### TELA DE LOGIN MODIFICADA #####
const LoginScreen = ({ onSwitchToSignUp, onSwitchToForgotPassword }) => {
    const { handleLogin } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [email, setEmail] = useState(''); // Mudado de 'matricula' para 'email'
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const onLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await handleLogin(email, password); // Passando 'email' em vez de 'matricula'
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Falha no Login', message: error.message });
        } finally {
            setLoading(false);
        }
    };

    const onForgotPasswordClick = (e) => {
        e.preventDefault();
        onSwitchToForgotPassword();
    };

    return (
        <div className="relative bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-gray-800">
            <div className="absolute top-4 right-4">
                <ThemeToggleButton />
            </div>
            <div className="text-center mb-8">
                 <img src="https://i.ibb.co/932Mzz8w/SITECicone.png" alt="Logo Sitec" className="mx-auto mb-4" style={{ width: '60px', height: '60px' }} />
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Controle de Ponto</h2>
                <p className="text-slate-500 dark:text-slate-400">Acesse sua conta para continuar.</p>
            </div>
            <form onSubmit={onLogin} className="space-y-4">
                 {/* Campo de input alterado para 'email' */}
                 <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400 flex justify-center items-center transition shadow-sm hover:shadow-md">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin"/> : 'Entrar'}
                 </button>
            </form>
            <div className="mt-4 flex justify-between items-center text-sm">
                <button onClick={onForgotPasswordClick} className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition">Esqueceu a Senha?</button>
                <button onClick={onSwitchToSignUp} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition">Criar Conta</button>
            </div>
        </div>
    );
};

const SignUpScreen = ({ onSwitchToLogin }) => {
    const { handleSignUp } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [matricula, setMatricula] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const onSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await handleSignUp(nome, email, matricula, password);
            setGlobalMessage({ type: 'success', title: 'Cadastro Realizado!', message: 'Sua conta foi criada com sucesso. Faça o login para continuar.' });
            onSwitchToLogin(); // Switch back to login screen on success
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Falha no Cadastro', message: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-gray-800">
            <div className="absolute top-4 right-4">
                <ThemeToggleButton />
            </div>
            <div className="text-center mb-8">
                 <img src="https://i.ibb.co/932Mzz8w/SITECicone.png" alt="Logo Sitec" className="mx-auto mb-4" style={{ width: '60px', height: '60px' }} />
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Criar Nova Conta</h2>
                <p className="text-slate-500 dark:text-slate-400">Preencha os dados para se cadastrar.</p>
            </div>
            <form onSubmit={onSignUp} className="space-y-4">
                 <input type="text" placeholder="Nome Completo" value={nome} onChange={(e) => setNome(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <input type="text" placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400 flex justify-center items-center transition shadow-sm hover:shadow-md">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin"/> : 'Cadastrar'}
                 </button>
            </form>
            <div className="mt-4 text-center text-sm">
                <button onClick={onSwitchToLogin} className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition">Já tem uma conta? Faça o login</button>
            </div>
        </div>
    );
};

const ForgotPasswordScreen = ({ onSwitchToLogin }) => {
    const { handleForgotPassword } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const onResetPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await handleForgotPassword(email);
            setGlobalMessage({ type: 'success', title: 'Email Enviado!', message: 'Se uma conta com este email existir, um link de recuperação foi enviado.' });
            onSwitchToLogin();
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Falha no Envio', message: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-gray-800">
            <div className="absolute top-4 right-4">
                <ThemeToggleButton />
            </div>
            <div className="text-center mb-8">
                <img src="https://i.ibb.co/932Mzz8w/SITECicone.png" alt="Logo Sitec" className="mx-auto mb-4" style={{ width: '60px', height: '60px' }} />
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Recuperar Senha</h2>
                <p className="text-slate-500 dark:text-slate-400">Insira seu email para receber o link de recuperação.</p>
            </div>
            <form onSubmit={onResetPassword} className="space-y-4">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400 flex justify-center items-center transition shadow-sm hover:shadow-md">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Enviar Link'}
                </button>
            </form>
            <div className="mt-4 text-center text-sm">
                <button onClick={onSwitchToLogin} className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition">Voltar para o Login</button>
            </div>
        </div>
    );
};

const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const formatDateOnly = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};
const formatDuration = (ms) => {
    if (ms === 0) return '00:00';
    const sign = ms < 0 ? '-' : '+';
    const absMs = Math.abs(ms);
    const totalSeconds = Math.round(absMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const SolicitationModal = ({ isOpen, onClose }) => {
    const { user, db } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [formData, setFormData] = useState({
        tipo: 'abono',
        dataOcorrencia: new Date().toISOString().split('T')[0],
        justificativaTexto: '',
        anexoFile: null,
    });
    const [loading, setLoading] = useState(false);
    const solicitationCollectionPath = `/artifacts/${appId}/public/data/solicitacoes`;

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        setFormData(prev => ({ ...prev, [name]: files ? files[0] : value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isFirebaseInitialized) {
            setGlobalMessage({ type: 'warning', title: 'Modo Demo', message: 'Envio de solicitações desabilitado.' });
            return;
        }
        setLoading(true);

        try {
            let anexoUrl = '';
            if (formData.anexoFile) {
                anexoUrl = `simulated://storage/${user.matricula}/${Date.now()}_${formData.anexoFile.name}`;
            }

            await addDoc(collection(db, solicitationCollectionPath), {
                requesterId: user.uid,
                requesterMatricula: user.matricula,
                requesterNome: user.nome,
                unidadeId: user.unidadeId,
                tipo: formData.tipo,
                dataOcorrencia: formData.dataOcorrencia,
                justificativaTexto: formData.justificativaTexto,
                anexoUrl,
                status: 'pendente',
                createdAt: new Date(),
            });

            setGlobalMessage({
                type: 'success',
                title: 'Solicitação Enviada',
                message: `Sua solicitação de ${formData.tipo} foi enviada com sucesso.`
            });
            onClose();
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro de Submissão', message: `Falha ao enviar: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
       <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Nova Solicitação de Ponto</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"><X className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de Solicitação</label>
                        <select name="tipo" value={formData.tipo} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500">
                            <option value="abono">Abono (Ajuste de Registro)</option>
                            <option value="justificativa">Justificativa (Ausência)</option>
                        </select>
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Data de Ocorrência</label>
                        <input type="date" name="dataOcorrencia" value={formData.dataOcorrencia} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"/>
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descrição Detalhada</label>
                        <textarea name="justificativaTexto" value={formData.justificativaTexto} onChange={handleChange} rows="4" required className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"></textarea>
                    </div>
                    <div className="space-y-1 p-3 border border-dashed rounded-lg dark:border-gray-700">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">Anexo (Opcional)</label>
                        <input type="file" name="anexoFile" onChange={handleChange} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/50 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/70 transition"/>
                        {formData.anexoFile && <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center"><File className="w-4 h-4 mr-1"/>{formData.anexoFile.name}</p>}
                    </div>
                    <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 transition">
                        {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                        {loading ? 'Enviando...' : 'Enviar Solicitação'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- NOVO COMPONENTE: Modal de Confirmação de Ponto ---
const PointConfirmationModal = ({ isOpen, onClose, onConfirm, type, timestamp, isLoading }) => {
    if (!isOpen) return null;

    const formattedTime = timestamp ? timestamp.toLocaleTimeString('pt-BR') : '';
    const formattedDate = timestamp ? timestamp.toLocaleDateString('pt-BR') : '';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
                    <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Confirmar Registro</h3>
                <p className="text-slate-600 dark:text-slate-300 mt-2">
                    Deseja registrar <strong>{type?.toUpperCase()}</strong>?
                </p>
                
                <div className="my-4 p-3 bg-slate-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{formattedTime}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{formattedDate}</p>
                </div>

                <div className="flex gap-3 mt-6">
                    <button 
                        onClick={onClose} 
                        disabled={isLoading}
                        className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 dark:bg-gray-700 dark:text-slate-200 dark:hover:bg-gray-600 transition font-medium disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={isLoading} 
                        className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center disabled:bg-blue-400"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
const ServidorDashboard = () => {
    const { user, userId, db, handleLogout, unidades } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [points, setPoints] = useState([]);
    const [lastPoint, setLastPoint] = useState(null);
    const [clockInLoading, setClockInLoading] = useState(false);
    // ... outros estados existentes ...
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [solicitacoes, setSolicitacoes] = useState([]);

    // --- NOVOS ESTADOS PARA CONFIRMAÇÃO ---
    const [isConfirmPointModalOpen, setIsConfirmPointModalOpen] = useState(false);
    const [pendingPoint, setPendingPoint] = useState({ type: null, timestamp: null });
    // --------------------------------------

    const pointCollectionPath = useMemo(() => `artifacts/${appId}/users/${userId}/registros_ponto`, [userId]);
    const solicitacoesCollectionPath = useMemo(() => `artifacts/${appId}/public/data/solicitacoes`, []);
    const unidadeNome = unidades[user?.unidadeId]?.name || 'Unidade não encontrada';

    useEffect(() => {
        if (!isFirebaseInitialized || !userId) return;
        const qPoints = query(collection(db, pointCollectionPath), orderBy('timestamp', 'desc'));
        const unsubPoints = onSnapshot(qPoints, (snapshot) => {
            const fetchedPoints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPoints(fetchedPoints);
            setLastPoint(fetchedPoints[0] || null);
        });

        const qSolicitations = query(collection(db, solicitacoesCollectionPath), where('requesterId', '==', userId), orderBy('createdAt', 'desc'));
        const unsubSolicitations = onSnapshot(qSolicitations, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { unsubPoints(); unsubSolicitations(); };
    }, [db, userId, pointCollectionPath, solicitacoesCollectionPath]);

    const dailySummary = useMemo(() => {
        const summary = {};
        let totalBalanceMs = 0;
        [...points].reverse().forEach(point => {
            const dateKey = formatDateOnly(point.timestamp);
            if (!summary[dateKey]) {
                summary[dateKey] = { points: [], totalMs: 0, balanceMs: 0 };
            }
            summary[dateKey].points.push(point);
        });
        Object.keys(summary).forEach(dateKey => {
            const day = summary[dateKey];
            let totalWorkedMs = 0;
            let currentSegmentStart = null;
            day.points.forEach(p => {
                const type = p.tipo;
                const timestamp = p.timestamp.toDate().getTime();
                if (type === 'entrada' || type === 'volta') {
                    if(currentSegmentStart === null) currentSegmentStart = timestamp;
                } else if ((type === 'saida' || type === 'pausa') && currentSegmentStart !== null) {
                    totalWorkedMs += (timestamp - currentSegmentStart);
                    currentSegmentStart = null;
                }
            });
            day.totalMs = totalWorkedMs;
            day.balanceMs = totalWorkedMs - TARGET_DAILY_HOURS_MS;
            totalBalanceMs += day.balanceMs;
        });
        return { summary, totalBalanceMs };
    }, [points]);

    const isShiftFinishedToday = useMemo(() => {
        if (!lastPoint || lastPoint.tipo !== 'saida') return false;
        const lastDate = lastPoint.timestamp.toDate();
        const today = new Date();
        return lastDate.getDate() === today.getDate() && lastDate.getMonth() === today.getMonth() && lastDate.getFullYear() === today.getFullYear();
    }, [lastPoint]);

    const nextPointType = useMemo(() => {
        if (isShiftFinishedToday) return 'finished';
        if (!lastPoint) return 'entrada';
        const typeMap = { 'entrada': 'pausa', 'pausa': 'volta', 'volta': 'saida', 'saida': 'entrada' };
        return typeMap[lastPoint.tipo] || 'entrada';
    }, [lastPoint, isShiftFinishedToday]);

    // --- FUNÇÃO 1: Abre o modal de confirmação ---
    const initiateRegisterPoint = (type) => {
        if (!userId || nextPointType === 'finished' || !isFirebaseInitialized) {
             // Mantém as verificações iniciais
             if (!isFirebaseInitialized) {
                 setGlobalMessage({ type: 'warning', title: 'Modo Demo', message: 'Registro de ponto desabilitado.'});
             }
             return;
        }
        // Salva o tipo e a hora ATUAL do clique para confirmação
        setPendingPoint({ type, timestamp: new Date() });
        setIsConfirmPointModalOpen(true);
    };

    // --- FUNÇÃO 2: Realmente registra o ponto (chamada pelo Modal) ---
    const confirmRegisterPoint = useCallback(async () => {
        const { type, timestamp } = pendingPoint;
        if (!userId || !type || !timestamp) return;
        
        setClockInLoading(true);

        try {
            await addDoc(collection(db, pointCollectionPath), {
                userId,
                timestamp: timestamp, // Usa o timestamp capturado no primeiro clique
                tipo: type,
                unidadeId: user.unidadeId,
            });
            setGlobalMessage({ type: 'success', title: 'Ponto Registrado!', message: `Sua ${type} foi registrada com sucesso.` });
            setIsConfirmPointModalOpen(false); // Fecha o modal após sucesso
        } catch (dbError) {
            setGlobalMessage({ type: 'error', title: 'Erro no Sistema', message: `Falha ao salvar o ponto: ${dbError.message}` });
        } finally {
            setClockInLoading(false);
        }
    }, [userId, db, pointCollectionPath, user?.unidadeId, pendingPoint, setGlobalMessage]);

    const buttonMap = {
        entrada: { label: 'Registrar Entrada', icon: LogIn, color: 'bg-emerald-600 hover:bg-emerald-700' },
        pausa: { label: 'Iniciar Pausa', icon: Pause, color: 'bg-amber-500 hover:bg-amber-600' },
        volta: { label: 'Retornar da Pausa', icon: RefreshCcw, color: 'bg-indigo-600 hover:bg-indigo-700' },
        saida: { label: 'Registrar Saída', icon: LogOut, color: 'bg-slate-500 hover:bg-slate-600' },
        finished: { label: 'Expediente Finalizado', icon: CheckCircle, color: 'bg-slate-400' },
    };
    const currentButton = buttonMap[nextPointType];

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
                <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center">
                            <Clock className="w-8 h-8 mr-3 text-blue-600" />
                            Ponto Eletrônico
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>.
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Matrícula: {user.matricula} | Unidade: {unidadeNome}
                        </p>
                    </div>
                    <div className="flex items-center space-x-3 self-end sm:self-center">
                        <ThemeToggleButton />
                        <button
                            onClick={handleLogout}
                            className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 transition duration-150 p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"
                        >
                            <LogOut className="w-4 h-4 mr-1.5" />
                            Sair
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="md:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                       <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100">Registrar Ponto</h2>
                       <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 bg-slate-50 dark:bg-gray-800/50 rounded-xl">
                            <div className="text-center sm:text-left">
                               <p className="text-sm text-slate-500 dark:text-slate-400">Próxima Ação:</p>
                               <p className={`text-2xl font-bold mt-1 ${nextPointType === 'finished' ? 'text-slate-500 dark:text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}>{currentButton.label}</p>
                               <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Último: {lastPoint ? `${lastPoint.tipo} às ${formatTime(lastPoint.timestamp)}` : 'Nenhum registro hoje'}</p>
                            </div>
                            <button onClick={() => initiateRegisterPoint(nextPointType)} disabled={clockInLoading || nextPointType === 'finished'} className={`flex items-center justify-center w-full sm:w-auto px-6 py-3 rounded-lg text-white font-semibold transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${currentButton.color} disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-md`}>
                                {clockInLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <currentButton.icon className="w-5 h-5 mr-2" />}
                                {clockInLoading ? 'Processando...' : currentButton.label}
                            </button>
                        </div>
                    </div>
                     <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800 flex flex-col justify-center">
                         <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Banco de Horas</p>
                         <p className={`text-4xl font-bold mt-1 ${dailySummary.totalBalanceMs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatDuration(dailySummary.totalBalanceMs)}
                         </p>
                         <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">Jornada Padrão: 8h/dia</p>
                    </div>
                </div>

                <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                   <div className="flex justify-between items-center mb-4">
                       <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center">Minhas Solicitações</h2>
                        <button onClick={() => setIsModalOpen(true)} className="flex items-center text-sm font-medium bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 shadow-sm transition">
                            <Plus className="w-4 h-4 mr-1" /> Nova Solicitação
                        </button>
                   </div>
                   <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead >
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo/Data</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                                {solicitacoes.slice(0, 5).map(sol => (
                                    <tr key={sol.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-slate-900 dark:text-slate-200">{sol.tipo === 'abono' ? 'Abono' : 'Justificativa'}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">{sol.dataOcorrencia}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status}</span>
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && <tr><td colSpan="2" className="py-8 text-center text-slate-500 dark:text-slate-400">Nenhuma solicitação encontrada.</td></tr>}
                            </tbody>
                        </table>
                   </div>
                </section>

                 <SolicitationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

                 {/* --- NOVO MODAL DE CONFIRMAÇÃO DE PONTO ADICIONADO --- */}
                 <PointConfirmationModal 
                    isOpen={isConfirmPointModalOpen}
                    onClose={() => setIsConfirmPointModalOpen(false)}
                    onConfirm={confirmRegisterPoint}
                    type={pendingPoint.type}
                    timestamp={pendingPoint.timestamp}
                    isLoading={clockInLoading}
                 />
            </div>
        </div>
    );
};

const GestorDashboard = () => {
    const { user, db, handleLogout, unidades } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loadingAction, setLoadingAction] = useState(null);
    const [viewingFile, setViewingFile] = useState(null);

    // --- INÍCIO DAS NOVAS ADIÇÕES ---
    const [servidoresDaUnidade, setServidoresDaUnidade] = useState([]);
    const [pontosDosServidores, setPontosDosServidores] = useState({});
    const [loadingRegistros, setLoadingRegistros] = useState(true);
    const usersCollectionPath = useMemo(() => `artifacts/${appId}/public/data/${USER_COLLECTION}`, []);
    // --- FIM DAS NOVAS ADIÇÕES ---

    const solicitacoesCollectionPath = useMemo(() => `artifacts/${appId}/public/data/solicitacoes`, []);
    const unidadeNome = unidades[user?.unidadeId]?.name || 'Unidade não encontrada';

    useEffect(() => {
        if (!isFirebaseInitialized || !user?.unidadeId) return;
        const q = query(
            collection(db, solicitacoesCollectionPath),
            where('unidadeId', '==', user.unidadeId),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db, solicitacoesCollectionPath, user?.unidadeId]);

    // --- INÍCIO DO NOVO useEffect ---
    // Busca servidores e seus registros de ponto recentes
    useEffect(() => {
        if (!isFirebaseInitialized || !user?.unidadeId) {
            setLoadingRegistros(false);
            return;
        }

        const fetchRegistros = async () => {
            setLoadingRegistros(true);
            try {
                // 1. Buscar todos os servidores da unidade do gestor
                const qServidores = query(collection(db, usersCollectionPath), 
                                          where('unidadeId', '==', user.unidadeId), 
                                          where('role', '==', 'servidor'));
                const servidoresSnapshot = await getDocs(qServidores);
                const servidores = servidoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setServidoresDaUnidade(servidores);

                // 2. Para cada servidor, buscar seus 10 últimos registros de ponto
                const pontosMap = {};
                for (const servidor of servidores) {
                    const pointCollectionPath = `artifacts/${appId}/users/${servidor.id}/registros_ponto`;
                    const qPontos = query(collection(db, pointCollectionPath), 
                                          orderBy('timestamp', 'desc'), 
                                          limit(10)); // Buscamos os 10 mais recentes
                    
                    const pontosSnapshot = await getDocs(qPontos);
                    pontosMap[servidor.id] = pontosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }
                setPontosDosServidores(pontosMap);

            } catch (error) {
                console.error("Erro ao buscar registros da unidade:", error);
                setGlobalMessage({ 
                    type: 'error', 
                    title: 'Erro de Leitura', 
                    message: 'Não foi possível carregar os registros de ponto. Verifique as regras de segurança do Firestore.' 
                });
            } finally {
                setLoadingRegistros(false);
            }
        };

        fetchRegistros();
    }, [db, user?.unidadeId, usersCollectionPath, setGlobalMessage]);
    // --- FIM DO NOVO useEffect ---

    const handleAction = useCallback(async (solicitationId, newStatus) => {
        setLoadingAction(solicitationId + newStatus);
        try {
            const solDocRef = doc(db, solicitacoesCollectionPath, solicitationId);
            await updateDoc(solDocRef, { status: newStatus, gestorId: user.uid, dataAprovacao: new Date() });
            setGlobalMessage({
                type: 'success',
                title: `Solicitação Atualizada`,
                message: `O status foi alterado para ${newStatus}.`
            });
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao atualizar o status: ${error.message}` });
        } finally {
            setLoadingAction(null);
        }
    }, [db, solicitacoesCollectionPath, user.uid, setGlobalMessage]);

    // --- INÍCIO DA NOVA FUNÇÃO PDF ---
    const handleGerarRelatorio = async () => {
        setGlobalMessage({ type: 'success', title: 'Relatório', message: 'Gerando relatório, aguarde...' });

        try {
            // 1. Buscar os servidores da unidade (reutiliza o state que já buscamos)
            if (servidoresDaUnidade.length === 0) {
                 setGlobalMessage({ type: 'warning', title: 'Aviso', message: 'Nenhum servidor encontrado nesta unidade para gerar relatório.' });
                 return;
            }

            const doc = new jsPDF();
            doc.text(`Relatório da Unidade: ${unidadeNome}`, 14, 16);
            doc.setFontSize(10);
            doc.text(`Gerado por: ${user.nome} em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

            const corpoTabela = [];

            // 2. Buscar TODOS os pontos de cada servidor
            for (const servidor of servidoresDaUnidade) {
                const pointCollectionPath = `artifacts/${appId}/users/${servidor.id}/registros_ponto`;
                // Sem 'limit()' para buscar todos os registros para o PDF
                const qPontos = query(collection(db, pointCollectionPath), orderBy('timestamp', 'desc')); 
                const pontosSnapshot = await getDocs(qPontos);

                corpoTabela.push([
                    { content: `Servidor: ${servidor.nome} (Mat: ${servidor.matricula})`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: '#f0f0f0' } }
                ]);

                if (pontosSnapshot.empty) {
                    corpoTabela.push([{ content: 'Nenhum registro encontrado.', colSpan: 3, styles: { fontStyle: 'italic' } }]);
                } else {
                    // 3. Formatar os dados para a tabela
                    pontosSnapshot.docs.forEach(pointDoc => {
                        const ponto = pointDoc.data();
                        corpoTabela.push([
                            formatDateOnly(ponto.timestamp),
                            ponto.tipo,
                            formatTime(ponto.timestamp)
                        ]);
                    });
                }
            }

            // 4. Gerar a tabela no PDF
            doc.autoTable({
                startY: 30,
                head: [['Data', 'Tipo', 'Hora']],
                body: corpoTabela,
                theme: 'striped',
                headStyles: { fillColor: [22, 160, 133] },
            });

            // 5. Salvar o arquivo
            doc.save(`relatorio_${unidadeNome.replace(/ /g, '_')}.pdf`);

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível gerar o relatório: ${error.message}` });
        }
    };
    // --- FIM DA NOVA FUNÇÃO PDF ---

    const getFileNameFromUrl = (url) => url.substring(url.lastIndexOf('/') + 1);

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center">
                            <User className="inline-block w-8 h-8 mr-3 text-blue-600" /> Painel do Gestor
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>. Unidade: {unidadeNome}.
                        </p>
                    </div>
                     <div className="flex items-center space-x-3 self-end sm:self-center">
                        <ThemeToggleButton />
                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30">
                            <LogOut className="w-4 h-4 mr-1.5" /> Sair
                        </button>
                    </div>
                </header>

                <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                    {/* --- INÍCIO DA MODIFICAÇÃO (Botão PDF) --- */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center">
                            <Mail className="w-5 h-5 mr-2 text-amber-500" />
                            Caixa de Solicitações ({solicitacoes.filter(s => s.status === 'pendente').length} pendentes)
                        </h2>
                        <button
                            onClick={handleGerarRelatorio} // AQUI ESTÁ O BOTÃO
                            className="flex items-center text-sm font-medium bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 shadow-sm transition w-full sm:w-auto"
                        >
                            <FileText className="w-4 h-4 mr-2" /> Gerar Relatório de Pontos
                        </button>
                    </div>
                    {/* --- FIM DA MODIFICAÇÃO --- */}


                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="border-b border-slate-200 dark:border-gray-800">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Servidor</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo/Data</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Justificativa</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status/Ações</th>
                                </tr>
                            </thead>
                            
                                {solicitacoes.map(sol => (
                                    <tr key={sol.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 py-4"><span className="text-sm font-medium text-slate-800 dark:text-slate-200">{sol.requesterNome}</span></td>
                                        <td className="px-4 py-4">
                                            <div className="font-semibold text-sm block">{sol.tipo.charAt(0).toUpperCase() + sol.tipo.slice(1)}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">{sol.dataOcorrencia}</div>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300 max-w-xs">
                                             <p className="truncate" title={sol.justificativaTexto}>{sol.justificativaTexto}</p>
                                            {sol.anexoUrl &&
                                                <button onClick={() => setViewingFile({ url: sol.anexoUrl, name: getFileNameFromUrl(sol.anexoUrl) })} className="text-blue-600 text-xs block mt-1 flex items-center hover:underline">
                                                    <File className="w-3 h-3 mr-1" /> Ver Anexo
                                                </button>
                                            }
                                        </td>
                                        <td className="px-4 py-4">
                                            {sol.status === 'pendente' ? (
                                                <div className="flex items-center space-x-2">
                                                    <button onClick={() => handleAction(sol.id, 'aprovado')} disabled={!!loadingAction} className="py-1 px-3 rounded-full text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-300">
                                                        {loadingAction === sol.id + 'aprovado' ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Aprovar'}
                                                    </button>
                                                    <button onClick={() => handleAction(sol.id, 'reprovado')} disabled={!!loadingAction} className="py-1 px-3 rounded-full text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300">
                                                        {loadingAction === sol.id + 'reprovado' ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Reprovar'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && <tr><td colSpan="4" className="py-8 text-center text-slate-500 dark:text-slate-400">Nenhuma solicitação pendente.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
                
                {/* --- INÍCIO DA NOVA SEÇÃO DE REGISTROS --- */}
                <section className="mt-8 bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                    <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100 flex items-center">
                        <Clock className="w-5 h-5 mr-2 text-blue-500" />
                        Registros de Ponto Recentes da Unidade
                    </h2>

                    {loadingRegistros ? (
                        <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></div>
                    ) : (
                        <div className="space-y-6">
                            {servidoresDaUnidade.length === 0 ? (
                                <p className="text-slate-500 dark:text-slate-400 text-center py-4">Nenhum servidor encontrado nesta unidade.</p>
                            ) : (
                                servidoresDaUnidade.map(servidor => (
                                    <div key={servidor.id}>
                                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">{servidor.nome}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Matrícula: {servidor.matricula}</p>
                                        <div className="overflow-x-auto border rounded-lg dark:border-gray-800">
                                            <table className="min-w-full">
                                                <thead className="bg-slate-50 dark:bg-gray-800/50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Data</th>
                                                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Tipo</th>
                                                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Hora</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                                                    {pontosDosServidores[servidor.id]?.length > 0 ? (
                                                        pontosDosServidores[servidor.id].map(ponto => (
                                                            <tr key={ponto.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                                                <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDateOnly(ponto.timestamp)}</td>
                                                                <td className="px-4 py-3 text-sm">
                                                                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[ponto.tipo] || 'bg-gray-200 text-gray-800'}`}>
                                                                        {ponto.tipo}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{formatTime(ponto.timestamp)}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="3" className="px-4 py-4 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum registro de ponto recente.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </section>
                {/* --- FIM DA NOVA SEÇÃO DE REGISTROS --- */}

                <FileViewerModal isOpen={!!viewingFile} onClose={() => setViewingFile(null)} fileUrl={viewingFile?.url} fileName={viewingFile?.name} />
            </div>
        </div>
    );
};

const UserManagement = () => {
    const { db, unidades } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const usersCollectionPath = `artifacts/${appId}/public/data/${USER_COLLECTION}`;

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setUsers([
                {id: 'demo1', nome: 'Admin Demo', matricula: '001', role: 'rh', unidadeId: 'unidade-adm-01'},
                {id: 'demo2', nome: 'Gestor Demo', matricula: '002', role: 'gestor', unidadeId: 'unidade-esc-01'},
                {id: 'demo3', nome: 'Servidor Demo', matricula: '003', role: 'servidor', unidadeId: 'unidade-esc-01'},
            ]);
            setLoading(false);
            return;
        };
        const q = query(collection(db, usersCollectionPath));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsubscribe();
    }, [db, usersCollectionPath]);

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUser || !isFirebaseInitialized) return;
        setIsSubmitting(true);
        try {
            const userDocRef = doc(db, usersCollectionPath, editingUser.id);
            await updateDoc(userDocRef, {
                role: editingUser.role,
                unidadeId: editingUser.unidadeId,
                nome: editingUser.nome,
                matricula: editingUser.matricula
            });
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: `Perfil do usuário ${editingUser.matricula} atualizado.` });
            setEditingUser(null);
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao atualizar o usuário: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!userToDelete || !isFirebaseInitialized) return;
        setIsSubmitting(true);
        try {
            const userDocRef = doc(db, usersCollectionPath, userToDelete.id);
            await deleteDoc(userDocRef);
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: `Usuário ${userToDelete.matricula} deletado.` });
            setUserToDelete(null);
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao deletar o usuário: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditingChange = (e) => {
        setEditingUser({ ...editingUser, [e.target.name]: e.target.value });
    };

    const filteredUsers = users.filter(u => u.nome?.toLowerCase().includes(searchTerm.toLowerCase()) || u.matricula?.toLowerCase().includes(searchTerm.toLowerCase()));
    const roleMap = { 'servidor': 'Servidor', 'gestor': 'Gestor', 'rh': 'RH/Admin' };

    return (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
            <h3 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-600" /> Gestão de Usuários
            </h3>
            <div className="relative w-full mb-4">
                <input
                    type="text"
                    placeholder="Buscar por nome ou matrícula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            </div>
             {loading ? (
                 <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></div>
            ) : (
                 <div className="overflow-x-auto">
                     <table className="min-w-full">
                         <thead className="border-b border-slate-200 dark:border-gray-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Matrícula/Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Perfil</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unidade</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                         <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                    <td className="px-4 py-3">
                                        <span className="text-sm font-medium block text-slate-800 dark:text-slate-100">{user.nome}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Matrícula: {user.matricula}</span>
                                    </td>
                                    <td className="px-4 py-3"><span className="text-sm text-slate-700 dark:text-slate-300">{roleMap[user.role] || user.role}</span></td>
                                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{unidades[user.unidadeId]?.name || 'N/A'}</td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button onClick={() => setEditingUser({...user})} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-1"><Edit className="w-4 h-4" /></button>
                                        <button onClick={() => setUserToDelete(user)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {editingUser && (
                 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
                     <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg animate-in zoom-in-95">
                         <div className="p-6 border-b dark:border-gray-800">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Editar Usuário</h3>
                        </div>
                         <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                            <div>
                                <label className="text-sm font-medium dark:text-slate-300">Nome</label>
                                <input type="text" name="nome" value={editingUser.nome} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
                            </div>
                            <div>
                                <label className="text-sm font-medium dark:text-slate-300">Matrícula</label>
                                <input type="text" name="matricula" value={editingUser.matricula} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
                            </div>
                            <div>
                                <label className="text-sm font-medium dark:text-slate-300">Perfil</label>
                                <select name="role" value={editingUser.role} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                    <option value="servidor">Servidor</option>
                                    <option value="gestor">Gestor</option>
                                    <option value="rh">RH/Admin</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium dark:text-slate-300">Unidade</label>
                                <select name="unidadeId" value={editingUser.unidadeId} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                    {Object.entries(unidades).map(([id, unit]) => (
                                        <option key={id} value={id}>{unit.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-slate-200 dark:bg-gray-700 dark:text-slate-200 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center disabled:bg-blue-400">
                                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <ConfirmationModal isOpen={!!userToDelete} title="Confirmar Exclusão" message={`Deseja realmente excluir o usuário ${userToDelete?.nome}? Esta ação é irreversível.`} onConfirm={handleDeleteUser} onCancel={() => setUserToDelete(null)} isLoading={isSubmitting} />
        </div>
    );
};

const UnitManagementModal = ({ isOpen, onClose, onSave, unit, setUnit, isLoading }) => {
    if (!isOpen) return null;
    const handleChange = (e) => setUnit({ ...unit, [e.target.name]: e.target.value });
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
                 <div className="p-6 border-b dark:border-gray-800"><h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{unit.id ? 'Editar Unidade' : 'Adicionar Unidade'}</h3></div>
                 <form onSubmit={onSave} className="p-6 space-y-4">
                    <div>
                        <label className="text-sm font-medium dark:text-slate-300">Nome da Unidade</label>
                        <input type="text" name="name" value={unit.name} onChange={handleChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-gray-800 dark:border-gray-700 dark:text-white" required />
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 dark:bg-gray-700 dark:text-slate-200 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center disabled:bg-blue-400">
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>} Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const UnitManagement = () => {
    const { db } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unitToEdit, setUnitToEdit] = useState(null);
    const [unitToDelete, setUnitToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const unitCollectionPath = `artifacts/${appId}/public/data/${UNIT_COLLECTION}`;

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setUnits(Object.entries({'unidade-adm-01': { name: 'Controle e Movimentação' }, 'unidade-esc-01': { name: 'Escola Municipal A' }}).map(([id, data]) => ({id, ...data})));
            setLoading(false);
            return;
        }
        const q = query(collection(db, unitCollectionPath), orderBy('name'));
        const unsubscribe = onSnapshot(q, snapshot => {
            setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsubscribe();
    }, [db, unitCollectionPath]);

    const handleSaveUnit = async (e) => {
        e.preventDefault();
        if (!unitToEdit?.name.trim() || !isFirebaseInitialized) return;
        setIsSubmitting(true);
        try {
            if (unitToEdit.id) {
                await updateDoc(doc(db, unitCollectionPath, unitToEdit.id), { name: unitToEdit.name.trim() });
            } else {
                await addDoc(collection(db, unitCollectionPath), { name: unitToEdit.name.trim() });
            }
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: `Unidade "${unitToEdit.name}" salva.` });
            setUnitToEdit(null);
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao salvar a unidade: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUnit = async () => {
        if (!unitToDelete || !isFirebaseInitialized) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, unitCollectionPath, unitToDelete.id));
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: `Unidade "${unitToDelete.name}" removida.` });
            setUnitToDelete(null);
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao remover a unidade: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold flex items-center text-slate-800 dark:text-slate-100"><Home className="w-5 h-5 mr-2 text-blue-600" /> Gestão de Unidades</h3>
                <button onClick={() => setUnitToEdit({ name: '' })} className="flex items-center text-sm font-medium bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"><Plus className="w-5 h-5 mr-1" /> Adicionar Unidade</button>
            </div>
             <div className="overflow-x-auto">
                 <table className="min-w-full">
                     <thead className="border-b border-slate-200 dark:border-gray-800">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome da Unidade</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                            {/* --- INÍCIO DA CORREÇÃO --- */}
                            {loading ? (
                                <tr>
                                    <td colSpan="2" className="py-8 text-center text-slate-500 dark:text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : (
                                units.map(unit => (
                                    <tr key={unit.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-200">{unit.name}</td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <button onClick={() => setUnitToEdit(unit)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-1"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => setUnitToDelete(unit)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {/* --- FIM DA CORREÇÃO --- */}
                        </tbody>
                </table>
            </div>
            <UnitManagementModal isOpen={!!unitToEdit} onClose={() => setUnitToEdit(null)} onSave={handleSaveUnit} unit={unitToEdit} setUnit={setUnitToEdit} isLoading={isSubmitting} />
            <ConfirmationModal isOpen={!!unitToDelete} title="Confirmar Exclusão" message={`Deseja realmente excluir a unidade "${unitToDelete?.name}"?`} onConfirm={handleDeleteUnit} onCancel={() => setUnitToDelete(null)} isLoading={isSubmitting}/>
        </div>
    );
};

const MessageBoxForAllUsers = () => {
    const { user: currentUser, db } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesCollectionPath = `artifacts/${appId}/public/data/global_messages`;

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim() || !isFirebaseInitialized) return;
        setLoading(true);
        try {
            await addDoc(collection(db, messagesCollectionPath), {
                text: message,
                senderName: currentUser.nome,
                senderRole: currentUser.role,
                createdAt: new Date(),
            });
            setGlobalMessage({ type: 'success', title: 'Mensagem Enviada', message: 'Sua mensagem foi enviada para todos os usuários.' });
            setMessage('');
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: 'Falha ao enviar mensagem.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
            <h3 className="text-xl font-semibold mb-2 text-slate-800 dark:text-slate-100 flex items-center"><MessageSquare className="w-5 h-5 mr-2 text-blue-600"/> Enviar Mensagem Global</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Envie uma notificação que aparecerá para todos os usuários ao entrarem no sistema.</p>
            <form onSubmit={handleSendMessage} className="space-y-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem aqui..." rows="4" required className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white"></textarea>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-2 px-4 rounded-lg text-white font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400">
                     {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                     {loading ? 'Enviando...' : 'Enviar Mensagem'}
                </button>
            </form>
        </div>
    );
};

const RHAdminDashboard = () => {
    const { user, handleLogout } = useAuthContext();
    const [activeTab, setActiveTab] = useState('users');
    const roleMap = { 'servidor': 'Servidor', 'gestor': 'Gestor', 'rh': 'RH/Admin' };

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100"><Briefcase className="inline w-8 h-8 mr-2 text-blue-600" /> Painel de Administração (RH)</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>. Perfil: {roleMap[user.role]}.</p>
                    </div>
                     <div className="flex items-center space-x-3 self-end sm:self-center">
                        <ThemeToggleButton />
                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"><LogOut className="w-4 h-4 mr-1.5" /> Sair</button>
                    </div>
                </header>

                <div className="border-b mb-6 dark:border-gray-800">
                    <nav className="flex space-x-2">
                         <button onClick={() => setActiveTab('users')} className={`flex items-center py-3 px-4 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'users' ? 'text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-gray-800 border-b-2 border-blue-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-gray-800/50'}`}><Users className="w-4 h-4 mr-2" /> Gestão de Usuários</button>
                         <button onClick={() => setActiveTab('units')} className={`flex items-center py-3 px-4 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'units' ? 'text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-gray-800 border-b-2 border-blue-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-gray-800/50'}`}><Home className="w-4 h-4 mr-2" /> Gestão de Unidades</button>
                         <button onClick={() => setActiveTab('messages')} className={`flex items-center py-3 px-4 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'messages' ? 'text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-gray-800 border-b-2 border-blue-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-gray-800/50'}`}><MessageSquare className="w-4 h-4 mr-2" /> Mensagem Global</button>
                    </nav>
                </div>

                {activeTab === 'users' && <UserManagement />}
                {activeTab === 'units' && <UnitManagement />}
                {activeTab === 'messages' && <MessageBoxForAllUsers />}
            </div>
        </div>
    );
};

const Footer = () => {
    return (
        <footer className="w-full py-4 mt-auto text-center border-t border-slate-200 dark:border-gray-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
                © Criado por ISAAC.J.S.B | Desenvolvido por GIULIANO.L & HENRIQUE.B
            </p>
        </footer>
    );
};

const AppContent = () => {
    const { user, role, isLoading } = useAuthContext();
    const [authView, setAuthView] = useState('login'); // 'login', 'signup', or 'forgotPassword'

    if (isLoading) {
        return <LoadingScreen />;
    }

    const dashboardMap = {
        servidor: <ServidorDashboard />,
        gestor: <GestorDashboard />,
        rh: <RHAdminDashboard />
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-800 dark:text-slate-200 antialiased">
            <main className={`flex-grow ${!user ? 'flex items-center justify-center p-4 bg-dots' : ''}`}>
                {!user ? (
                    (() => {
                        switch (authView) {
                            case 'signup':
                                return <SignUpScreen onSwitchToLogin={() => setAuthView('login')} />;
                            case 'forgotPassword':
                                return <ForgotPasswordScreen onSwitchToLogin={() => setAuthView('login')} />;
                            case 'login':
                            default:
                                return <LoginScreen onSwitchToSignUp={() => setAuthView('signup')} onSwitchToForgotPassword={() => setAuthView('forgotPassword')} />;
                        }
                    })()
                ) : (
                    dashboardMap[role] || <p>Perfil de usuário desconhecido.</p>
                )}
            </main>
            <Footer />
        </div>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <GlobalMessageProvider>
                <AuthProvider>
                    <GlobalMessageContainer />
                    <AppContent />
                </AuthProvider>
            </GlobalMessageProvider>
        </ThemeProvider>
    );
}
