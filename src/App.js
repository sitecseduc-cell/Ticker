import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
    getFirestore, doc, collection, query, where, orderBy, onSnapshot,
    addDoc, getDoc, updateDoc, deleteDoc, getDocs, setDoc, Timestamp // <-- Timestamp importado
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    LogIn, LogOut, Clock, User, Briefcase, RefreshCcw, Loader2, CheckCircle,
    AlertTriangle, XCircle, Pause, Mail, Users, FileText, Edit,
    Trash2, X, File, Send, Search, Plus, Home, MessageSquare, Sun, Moon,
    Calendar, Bell, Eye, BellRing, Edit3 // <-- Ícone de Edição adicionado
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

let app, auth, db, storage;
let isFirebaseInitialized = false;
let appId = 'secretaria-educacao-ponto-demo'; // Valor padrão

try {
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        isFirebaseInitialized = true;
        appId = firebaseConfig.appId;
    } else {
        console.warn("Configuração do Firebase não encontrada. Usando modo de demonstração.");
        app = {}; auth = {}; db = null; storage = null;
    }
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
    app = {}; auth = {}; db = null; storage = null;
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
    // --- 👇 ADICIONE ESTAS DUAS LINHAS 👇 ---
    mensagem: 'text-blue-700 bg-blue-100 dark:bg-blue-900/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
    ciente: 'text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600',
    // --- 👆 FIM DA ADIÇÃO 👆 ---
};
const TARGET_DAILY_HOURS_MS = 8 * 60 * 60 * 1000;
const TARGET_INTERN_DAILY_HOURS_MS = 4 * 60 * 60 * 1000; // <-- ADICIONADO

// --- Helper: Retorna a meta de horas com base na função ---
const getTargetHoursMs = (role) => {
    if (role === 'estagiario') {
        return TARGET_INTERN_DAILY_HOURS_MS;
    }
    return TARGET_DAILY_HOURS_MS;
};
const USER_COLLECTION = 'users';
const UNIT_COLLECTION = 'unidades';

// --- Helper: Pega a data de hoje no formato YYYY-MM-DD ---
const getTodayISOString = () => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset()); // Ajusta para o fuso horário local
    return today.toISOString().split('T')[0];
};

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

// --- 👇 ADICIONE ESTE NOVO HOOK 👇 ---
function useClock() {
    const [date, setDate] = useState(new Date());

    useEffect(() => {
        // Inicia um intervalo que atualiza o estado 'date' a cada segundo
        const timerId = setInterval(() => {
            setDate(new Date());
        }, 1000); 

        // Limpa o intervalo quando o componente é desmontado
        return () => clearInterval(timerId);
    }, []);

    return date; // Retorna o objeto Date completo e atualizado
}
// --- 👆 FIM DO NOVO HOOK 👆 ---

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
    const [globalMessages, setGlobalMessages] = useState([]);
    const [allUsers, setAllUsers] = useState([]); 

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

    // Carregar mensagens globais
    useEffect(() => {
        if (!isFirebaseInitialized) return;

        const messagesRef = collection(db, `artifacts/${appId}/public/data/global_messages`);
        const q = query(messagesRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setGlobalMessages(messages);
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
                    const userData = { uid: firebaseUser.uid, ...userSnap.data() };
                    setUser(userData);

                    if (userData.role === 'gestor' || userData.role === 'rh') {
                        const usersRef = collection(db, `artifacts/${appId}/public/data/${USER_COLLECTION}`);
                        const qUsers = query(usersRef);
                        const usersSnapshot = await getDocs(qUsers);
                        setAllUsers(usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                    }

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

        //try {
           // const usersRef = collection(db, 'artifacts', appId, 'public', 'data', USER_COLLECTION);
            //const q = query(usersRef, where("matricula", "==", matricula));
            //const querySnapshot = await getDocs(q);

            //if (!querySnapshot.empty) {
               // throw new Error("Esta matrícula já está em uso.");
            //}

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

       // } catch (error) {
          //  console.error("Firebase sign-up failed:", error);
          //  if (error.code === 'auth/email-already-in-use') {
           //     throw new Error("Este email já está em uso.");
          //  }
        //    throw new Error(error.message || "Falha ao criar a conta.");
      //  } //
   }, []);

    const handleLogin = useCallback(async (email, password) => {
        if (!isFirebaseInitialized) {
            throw new Error('Email ou senha incorretos.');
        }

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch(error) {
             console.error("Firebase login failed:", error);
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
        globalMessages,
        allUsers,
        handleLogin,
        handleLogout,
        handleSignUp,
        handleForgotPassword,
        db,
        auth,
        storage 
    }), [user, isLoading, unidades, globalMessages, allUsers, handleLogin, handleLogout, handleSignUp, handleForgotPassword]);

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

    const isImage = fileUrl && /\.(jpe?g|png|gif|webp)$/i.test(fileName || fileUrl);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Visualizar Anexo</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 break-all">Arquivo: {fileName || 'Arquivo'}</p>

                <div className="mt-4 p-4 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 min-h-[200px] flex items-center justify-center">
                    {isImage ? (
                        <img 
                            src={fileUrl} 
                            alt={`Anexo ${fileName}`} 
                            className="max-w-full max-h-[400px] rounded-md" 
                            onError={(e) => { e.target.onerror = null; e.target.outerHTML = '<p class="text-red-500">Erro ao carregar imagem.</p>'; }}
                        />
                    ) : (
                        <div className="text-center">
                            <FileText className="w-16 h-16 text-slate-400 mx-auto" />
                            <p className="font-semibold dark:text-slate-200 mt-2">Não é possível pré-visualizar este arquivo.</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300">Você pode baixá-lo para visualizar.</p>
                            <a 
                                href={fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                download={fileName}
                                className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                Baixar Arquivo
                            </a>
                        </div>
                    )}
                </div>

                <button onClick={onClose} className="mt-6 w-full py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition">Fechar</button>
            </div>
        </div>
    );
};

// Modal para exibir a *nova* mensagem global
const NewMessageModal = ({ isOpen, onClose, message, onAcknowledge }) => {
    const [loading, setLoading] = useState(false);

    if (!isOpen || !message) return null;

    const handleAcknowledge = async () => {
        setLoading(true);
        await onAcknowledge(message.id);
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center">
                        <BellRing className="w-5 h-5 mr-2 text-blue-500" /> Nova Mensagem Global
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"><X className="w-6 h-6" /></button>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-gray-800 rounded-lg max-h-[50vh] overflow-y-auto">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Enviada por: <span className="font-medium">{message.senderName} ({message.senderRole})</span>
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Em: {formatDateOnly(message.createdAt)} às {formatTime(message.createdAt)}
                    </p>
                    <p className="mt-3 text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{message.text}</p>
                </div>
                <button 
                    onClick={handleAcknowledge} 
                    disabled={loading}
                    className="mt-6 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center disabled:bg-blue-400"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Marcar como Ciente"}
                </button>
            </div>
        </div>
    );
};

// Modal para exibir *todas* as mensagens globais
const GlobalMessagesViewerModal = ({ isOpen, onClose, messages, role, onDelete, onViewReads }) => {
    if (!isOpen) return null;
    const canManage = role === 'rh' || role === 'gestor';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 h-[70vh] flex flex-col">
                <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Mensagens Globais</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"><X className="w-6 h-6" /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {messages.length === 0 ? (
                        <p className="text-slate-500 dark:text-slate-400 text-center py-8">Nenhuma mensagem global encontrada.</p>
                    ) : (
                        messages.map(msg => {
                            const readCount = msg.readBy ? Object.keys(msg.readBy).length : 0;
                            return (
                                <div key={msg.id} className="p-4 bg-slate-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Enviada por: <span className="font-medium">{msg.senderName} ({msg.senderRole})</span>
                                    </p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Em: {formatDateOnly(msg.createdAt)} às {formatTime(msg.createdAt)}
                                    </p>
                                    <p className="mt-3 text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{msg.text}</p>

                                    {/* Ações do Admin/Gestor */}
                                    {canManage && (
                                        <div className="flex items-center justify-between mt-4 pt-3 border-t dark:border-gray-700">
                                            <button 
                                                onClick={() => onViewReads(msg)}
                                                className="flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                <Eye className="w-4 h-4 mr-1" />
                                                Visualizado por {readCount}
                                            </button>
                                            <button 
                                                onClick={() => onDelete(msg.id)}
                                                className="flex items-center text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                Excluir
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
                <div className="p-4 border-t dark:border-gray-800">
                    <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// Modal para exibir *quem* leu a mensagem
const MessageReadStatusModal = ({ isOpen, onClose, message }) => {

    // --- CORREÇÃO INÍCIO ---
    // O Hook 'useMemo' foi movido para o TOPO do componente.
    const readers = useMemo(() => {
        // A verificação de 'message' agora é feita aqui dentro
        if (!message || !message.readBy) return [];

        // Transforma o map 'readBy' em um array e ordena por nome
        return Object.values(message.readBy).sort((a, b) => a.nome.localeCompare(b.nome));
    }, [message]);

    // O retorno condicional (if) agora vem DEPOIS dos Hooks.
    if (!isOpen || !message) return null;
    // --- CORREÇÃO FIM ---

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 h-[70vh] flex flex-col">
                <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Status de Leitura</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"><X className="w-6 h-6" /></button>
                </div>
                <div className="p-4 bg-slate-100 dark:bg-gray-800 border-b dark:border-gray-700">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">Mensagem: "{message.text}"</p>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-100">{readers.length} Servidores marcaram como ciente:</h4>
                    {readers.length === 0 ? (
                        <p className="text-slate-500 dark:text-slate-400 text-center py-8">Ninguém marcou esta mensagem como ciente ainda.</p>
                    ) : (
                        <ul className="divide-y dark:divide-gray-700">
                            {readers.map(reader => (
                                <li key={reader.matricula} className="py-2">
                                    <p className="font-medium text-slate-700 dark:text-slate-200">{reader.nome} ({reader.matricula})</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {/* Adiciona verificação se readAt existe antes de formatar */}
                                        Ciente em: {reader.readAt ? `${formatDateOnly(reader.readAt.toDate())} às ${formatTime(reader.readAt.toDate())}` : 'Data indisponível'}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="p-4 border-t dark:border-gray-800">
                    <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// --- NOVO COMPONENTE: Modal de Edição de Ponto (COM OBSERVAÇÃO) ---
const EditPointModal = ({ isOpen, onClose, point, onSave }) => {
    const [newTime, setNewTime] = useState('');
    const [observacao, setObservacao] = useState(''); // <-- NOVO ESTADO
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (point && point.timestamp) {
            // Formata o timestamp original para HH:MM
            const d = point.timestamp.toDate();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            setNewTime(`${hours}:${minutes}`);

            // Define a observação existente (se houver)
            setObservacao(point.observacao || ''); // <-- ADICIONADO
        }
    }, [point]);

    if (!isOpen || !point) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Passa a observação para a função de salvar
        await onSave(newTime, observacao); // <-- MODIFICADO
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <form onSubmit={handleSave} className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ajustar Registro de Ponto</h3>
                <div className="mt-4 space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Servidor: <span className="font-semibold">{point.servidorNome}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Data: <span className="font-semibold">{formatDateOnly(point.timestamp)}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Tipo: <span className="font-semibold">{point.tipo.toUpperCase()}</span>
                    </p>
                    <div className="pt-2">
                        <label htmlFor="time-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Novo Horário:
                        </label>
                        <input
                            type="time"
                            id="time-input"
                            value={newTime}
                            onChange={(e) => setNewTime(e.target.value)}
                            required
                            className="w-full mt-1 p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    {/* --- CAMPO DE OBSERVAÇÃO ADICIONADO --- */}
                    <div className="pt-2">
                        <label htmlFor="observacao-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Observação (Opcional):
                        </label>
                        <textarea
                            id="observacao-input"
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            rows="3"
                            placeholder="Ex: Ajuste solicitado pelo servidor..."
                            className="w-full mt-1 p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    {/* --- FIM DO CAMPO ADICIONADO --- */}
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-gray-700 dark:text-slate-200 dark:hover:bg-gray-600 transition">
                        Cancelar
                    </button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400 flex items-center">
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Salvar Ajuste
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- 👇 COLE O NOVO COMPONENTE AQUI 👇 ---
// --- NOVO COMPONENTE: Modal de Adição Manual de Ponto ---
const AddPointModal = ({ isOpen, onClose, servidorNome, onSave, selectedDate }) => {
    const [tipo, setTipo] = useState('entrada');
    const [newTime, setNewTime] = useState('08:00');
    const [observacao, setObservacao] = useState('');
    const [loading, setLoading] = useState(false);

    // Limpa a observação quando o modal é aberto
    useEffect(() => {
        if (isOpen) {
            setObservacao('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Passa os 3 dados para a função de salvar
        await onSave(tipo, newTime, observacao);
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <form onSubmit={handleSave} className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Adicionar Registro Manual</h3>
                <div className="mt-4 space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Servidor: <span className="font-semibold">{servidorNome}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Data: <span className="font-semibold">{new Date(selectedDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                    </p>
                    
                    <div className="pt-2">
                        <label htmlFor="tipo-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Tipo de Registro:
                        </label>
                        <select
                            id="tipo-input"
                            value={tipo}
                            onChange={(e) => setTipo(e.target.value)}
                            required
                            className="w-full mt-1 p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="entrada">Entrada</option>
                            <option value="pausa">Pausa</option>
                            <option value="volta">Volta da Pausa</option>
                            <option value="saida">Saída</option>
                        </select>
                    </div>

                    <div className="pt-2">
                        <label htmlFor="time-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Horário do Registro:
                        </label>
                        <input
                            type="time"
                            id="time-input"
                            value={newTime}
                            onChange={(e) => setNewTime(e.target.value)}
                            required
                            className="w-full mt-1 p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                
                    <div className="pt-2">
                        <label htmlFor="observacao-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Observação (Obrigatória):
                        </label>
                        <textarea
                            id="observacao-input"
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            rows="3"
                            placeholder="Ex: Lançamento manual por esquecimento do servidor..."
                            required
                            className="w-full mt-1 p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-gray-700 dark:text-slate-200 dark:hover:bg-gray-600 transition">
                        Cancelar
                    </button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400 flex items-center">
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Adicionar Registro
                    </button>
                </div>
            </form>
        </div>
    );
};
// --- 👆 FIM DO NOVO COMPONENTE 👆 ---

// --- 👇 COLE ESTE NOVO COMPONENTE DE MODAL AQUI 👇 ---
const ServerBalanceModal = ({ isOpen, onClose, serverName, balanceData }) => {
    const { totalBalanceMs, loading } = balanceData;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Banco de Horas</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    Saldo acumulado para: <span className="font-semibold">{serverName}</span>
                </p>
                <div className="text-center p-6 bg-slate-50 dark:bg-gray-800/50 rounded-xl">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-24">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Calculando saldo...</p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Saldo Total Acumulado:</p>
                            <p className={`text-5xl font-bold mt-2 ${totalBalanceMs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatDuration(totalBalanceMs)}
                            </p>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="mt-6 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                    Fechar
                </button>
            </div>
        </div>
    );
};
// --- 👆 FIM DO NOVO COMPONENTE 👆 ---


const LoginScreen = ({ onSwitchToSignUp, onSwitchToForgotPassword }) => {
    const { handleLogin } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();

    // --- CORREÇÃO VERCEL: Lê o localStorage *antes* dos hooks ---
    const initialRememberMe = localStorage.getItem('rememberMePreference') === 'true';
    const initialEmail = initialRememberMe ? localStorage.getItem('rememberedEmail') || '' : '';

    const [rememberMe, setRememberMe] = useState(initialRememberMe);
    const [email, setEmail] = useState(initialEmail);
    // --- FIM DA CORREÇÃO ---

    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const onLogin = async (e) => {
        e.preventDefault();

        if (rememberMe) {
            localStorage.setItem('rememberedEmail', email);
            localStorage.setItem('rememberMePreference', 'true');
        } else {
            localStorage.removeItem('rememberedEmail');
            localStorage.removeItem('rememberMePreference');
        }

        setLoading(true);
        try {
            await handleLogin(email, password);
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
                 <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
                 <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />

                 <div className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        id="rememberMe"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label 
                        htmlFor="rememberMe" 
                        className="text-sm text-slate-600 dark:text-slate-300"
                    >
                        Lembrar meu email
                    </label>
                 </div>

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
            onSwitchToLogin();
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
    if (ms === null || ms === undefined) return '00:00'; 
    const sign = ms < 0 ? '-' : '+';
    const absMs = Math.abs(ms);
    const totalSeconds = Math.round(absMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// --- 👇 ADICIONE ESTE NOVO HELPER 👇 ---
const formatFullTime = (date) => {
    if (!date) return '00:00:00';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};
// --- 👆 FIM DO NOVO HELPER 👆 ---

const SolicitationModal = ({ isOpen, onClose }) => {
    const { user, db, storage } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [formData, setFormData] = useState({
        tipo: 'abono',
        dataOcorrencia: getTodayISOString(),
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
            let anexoNome = '';
            if (formData.anexoFile) {
                const file = formData.anexoFile;
                anexoNome = file.name;
                const storageRef = ref(storage, `anexos/${user.uid}/${Date.now()}_${anexoNome}`);

                const snapshot = await uploadBytes(storageRef, file);
                anexoUrl = await getDownloadURL(snapshot.ref);
            }

            await addDoc(collection(db, solicitationCollectionPath), {
                requesterId: user.uid,
                requesterMatricula: user.matricula,
                requesterNome: user.nome,
                unidadeId: user.unidadeId,
                tipo: formData.tipo,
                dataOcorrencia: formData.dataOcorrencia,
                justificativaTexto: formData.justificativaTexto,
                anexoUrl: anexoUrl,
                anexoNome: anexoNome,
                status: 'pendente',
                createdAt: new Date(),
            });

            setGlobalMessage({
                type: 'success',
                title: 'Solicitação Enviada',
                message: `Sua solicitação de ${formData.tipo} foi enviada com sucesso.`
            });
            onClose();
            setFormData({
                tipo: 'abono',
                dataOcorrencia: getTodayISOString(),
                justificativaTexto: '',
                anexoFile: null,
            });
        } catch (error) {
            console.error("Erro ao enviar solicitação:", error);
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
                            <option value="mensagem">Mensagem (Aviso/Informação)</option>
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

const ServidorDashboard = () => {
    const { user, userId, db, handleLogout, unidades, globalMessages } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const now = useClock(); // <-- ADICIONE ESTA LINHA
    const [points, setPoints] = useState([]);
    const [lastPoint, setLastPoint] = useState(null);
    const [clockInLoading, setClockInLoading] = useState(false);
    const [actionToConfirm, setActionToConfirm] = useState(null); // <-- ADICIONE ESTE ESTADO
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [solicitacoes, setSolicitacoes] = useState([]);

    const [viewDate, setViewDate] = useState(getTodayISOString());

    const [isNotificationListOpen, setIsNotificationListOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastReadTimestamp = localStorage.getItem(`lastReadTimestamp_${userId}`) || 0; // Chave por usuário

    const pointCollectionPath = useMemo(() => `artifacts/${appId}/users/${userId}/registros_ponto`, [userId]);
    const solicitacoesCollectionPath = useMemo(() => `artifacts/${appId}/public/data/solicitacoes`, []);
    const unidadeNome = unidades[user?.unidadeId]?.name || 'Unidade não encontrada';

    // Este useEffect busca TODOS os pontos
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

    // Calcula msgs não lidas
    useEffect(() => {
        if (globalMessages.length > 0) {
            const newUnreadCount = globalMessages.filter(
                msg => msg.createdAt.toDate().getTime() > lastReadTimestamp
            ).length;
            setUnreadCount(newUnreadCount);
        }
    }, [globalMessages, lastReadTimestamp]);


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

        Object.keys(summary).sort().forEach(dateKey => {
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

            // Considera o dia atual como "em andamento" se não houver 'saida'
            if (currentSegmentStart !== null && dateKey === formatDateOnly(new Date())) {
                totalWorkedMs += (new Date().getTime() - currentSegmentStart);
            }

            day.totalMs = totalWorkedMs;

           // --- INÍCIO DA CORREÇÃO ---
            const lastPointOfDay = day.points[day.points.length - 1];
            const userTargetMs = getTargetHoursMs(user.role); // <-- SUA LÓGICA DE 4/8 HORAS

            if (lastPointOfDay && lastPointOfDay.tipo === 'saida') {
                 day.balanceMs = totalWorkedMs - userTargetMs; // <-- USANDO A META CORRETA
            } else {
                 day.balanceMs = 0; // Não conta saldo para dias não finalizados
            }
            // --- FIM DA CORREÇÃO ---

           // Apenas adiciona ao saldo total se o dia foi finalizado
            if (day.balanceMs !== 0) {
                totalBalanceMs += day.balanceMs;
            }
        });
        return { summary, totalBalanceMs };
    }, [points, user.role, now]); // <-- MUDE AQUI

    const selectedDayData = useMemo(() => {
        const dateObj = new Date(viewDate);
        dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
        const dateKey = formatDateOnly(dateObj);

        const day = dailySummary.summary[dateKey] || { points: [], totalMs: 0, balanceMs: 0 };

        // Recalcula o saldo do dia selecionado (especialmente para 'hoje' em andamento)
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

        // Se for hoje e ainda estiver trabalhando
        if (currentSegmentStart !== null && dateKey === formatDateOnly(new Date())) {
            totalWorkedMs += (new Date().getTime() - currentSegmentStart);
        }

        day.totalMs = totalWorkedMs;

        // --- INÍCIO DA CORREÇÃO ---

        // Esta linha estava faltando no seu código e causou o erro:
        const lastPointOfDay = day.points[day.points.length - 1]; 

        // Esta é a sua nova lógica de 4/8 horas:
        const userTargetMs = getTargetHoursMs(user.role); 

        if (lastPointOfDay && lastPointOfDay.tipo === 'saida') {
            day.balanceMs = totalWorkedMs - userTargetMs;
        } else if (dateKey === formatDateOnly(now)) { // <-- MUDANÇA 3
            // Se for hoje e não estiver finalizado, o saldo é 0
            day.balanceMs = 0; 
        } else {
            // Se for um dia passado não finalizado, o saldo é negativo
            day.balanceMs = totalWorkedMs - userTargetMs;
        }
        // --- FIM DA CORREÇÃO ---


        return day;
        }, [dailySummary.summary, viewDate, user.role]); // <-- ADICIONADO user.role

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

    // --- 👇 COLE TODO O BLOCO DE CÓDIGO NOVO AQUI 👇 ---

    // Efeito para agendar a notificação de saída
    useEffect(() => {
        // 1. Verifica se o usuário JÁ BATEU o ponto de saída.
        // Se sim, a função para e não faz nada.
        if (isShiftFinishedToday) {
            return;
        }

        // 2. Verifica se o navegador suporta notificações
        if (!("Notification" in window)) {
            console.warn("Este navegador não suporta notificações de desktop.");
            return;
        }

        // 3. Esta é a função que efetivamente MOSTRA a notificação
        const showReminderNotification = () => {
            // Verificamos de novo se a permissão é 'granted' (concedida)
            if (Notification.permission === 'granted') {
                new Notification('Lembrete de Ponto! ⏰', {
                    body: 'Quase 17h! Não se esqueça de registrar sua SAÍDA.',
                    icon: 'https://i.ibb.co/932Mzz8w/SITECicone.png', // Ícone da sua logo
                    silent: false // Garante que faça som (se o PC permitir)
                });
            }
        };

        // 4. Esta função calcula o tempo e agenda o "despertador"
        const scheduleReminder = () => {
            const now = new Date();
            
            // Define a hora alvo: 16:50:00
            const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 50, 0);
            //UTILIZAR APENAS AFINS PARA TESTE
            //const targetTime = new Date(Date.now() + 10000); // TESTE: Dispara em 10 segundos

            // Calcula quantos milissegundos faltam até 16:50
            const msUntilTarget = targetTime.getTime() - now.getTime();

            // Se já passou das 16:50, não faz nada
            if (msUntilTarget <= 0) {
                return null;
            }

            // Agenda o despertador (setTimeout)
            const timerId = setTimeout(showReminderNotification, msUntilTarget);
            return timerId; // Retorna o ID do timer para podermos cancelá-lo
        };

        // --- LÓGICA PRINCIPAL ---
        let notificationTimerId = null;

        // 5. Se o usuário JÁ DEU PERMISSÃO antes:
        if (Notification.permission === 'granted') {
            notificationTimerId = scheduleReminder();
        } 
        // 6. Se o usuário NUNCA RESPONDEU (ou negou):
        else if (Notification.permission !== 'denied') {
            // Pede a permissão. Isso mostra o pop-up "Permitir / Bloquear"
            Notification.requestPermission().then((permission) => {
                // Se ele clicar em "Permitir", agendamos a notificação
                if (permission === 'granted') {
                    notificationTimerId = scheduleReminder();
                }
            });
        }

        // 7. FUNÇÃO DE LIMPEZA:
        // Se o usuário bater o ponto de saída (isShiftFinishedToday mudar),
        // ou se ele fechar a aba, o React cancela o despertador (clearTimeout).
        return () => {
            if (notificationTimerId) {
                clearTimeout(notificationTimerId);
            }
        };

    // Esta é a dependência mais importante.
    // O código acima só roda de novo se o status de "Turno Finalizado" mudar.
    }, [isShiftFinishedToday]); 

// --- 👆 FIM DO BLOCO NOVO 👆 ---

    const registerPoint = useCallback(async (type) => {
        if (!userId || nextPointType === 'finished' || !isFirebaseInitialized) {
            setGlobalMessage({ type: 'warning', title: 'Modo Demo', message: 'Registro de ponto desabilitado.'});
            return;
        }
        setClockInLoading(true);

        try {
            await addDoc(collection(db, pointCollectionPath), {
                userId,
                timestamp: new Date(),
                tipo: type,
                unidadeId: user.unidadeId,
            });
            setGlobalMessage({ type: 'success', title: 'Ponto Registrado!', message: `Sua ${type} foi registrada.` });
        } catch (dbError) {
            setGlobalMessage({ type: 'error', title: 'Erro no Sistema', message: `Falha ao salvar o ponto: ${dbError.message}` });
        } finally {
            setClockInLoading(false);
        }
    }, [userId, db, pointCollectionPath, user?.unidadeId, nextPointType, setGlobalMessage]);

    // Esta função será chamada pelo "Confirmar" do modal
    const handleConfirmPoint = async () => {
        if (!actionToConfirm) return;
        
        // A função registerPoint já cuida do setLoading(true/false)
        await registerPoint(actionToConfirm); 
        
        setActionToConfirm(null); // Fecha o modal após o registro
        
    };

    // Abre o modal de lista e marca as mensagens como lidas
    const openNotificationList = () => {
        setIsNotificationListOpen(true);
        if (globalMessages.length > 0) {
            // Usa o user.uid que vem do contexto
            localStorage.setItem(`lastReadTimestamp_${user.uid}`, globalMessages[0].createdAt.toDate().getTime().toString());
        }
        setUnreadCount(0);
    };

    const buttonMap = {
        entrada: { label: 'Registrar Entrada', icon: LogIn, color: 'bg-emerald-600 hover:bg-emerald-700' },
        pausa: { label: 'Iniciar Pausa', icon: Pause, color: 'bg-amber-500 hover:bg-amber-600' },
        volta: { label: 'Retornar da Pausa', icon: RefreshCcw, color: 'bg-indigo-600 hover:bg-indigo-700' },
        saida: { label: 'Registrar Saída', icon: LogOut, color: 'bg-slate-500 hover:bg-slate-600' },
        finished: { label: 'Expediente Finalizado', icon: CheckCircle, color: 'bg-slate-400' },
    };
    const currentButton = buttonMap[nextPointType];

    // Saldo do dia selecionado (para o card principal)
    const selectedDayBalanceMs = selectedDayData.balanceMs;
    // Saldo total (para o texto pequeno)
    const totalBalanceMs = dailySummary.totalBalanceMs;

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
                            onClick={openNotificationList}
                            className="relative p-2 rounded-full bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Ver mensagens"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute top-0 right-0 block h-4 w-4 rounded-full bg-red-600 text-white text-xs font-bold text-center" style={{ fontSize: '0.6rem', lineHeight: '1rem' }}>
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={handleLogout}
                            className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 transition duration-150 p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"
                        >
                            <LogOut className="w-4 h-4 mr-1.5" />
                            Sair
                        </button>
                    </div>
                </header>

                {/* --- 👇 ADICIONE ESTE NOVO BLOCO DE RELÓGIO 👇 --- */}
                <div className="mb-6 bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800 text-center">
                    <h2 className="text-5xl font-bold text-slate-800 dark:text-slate-100 tracking-wider">
                        {formatFullTime(now)}
                    </h2>
                    <p className="text-lg font-medium text-blue-600 dark:text-blue-400 mt-2">
                        {/* Verificamos se o dia selecionado é hoje.
                          Se for, mostramos o tempo real.
                          Se não for, mostramos o tempo calculado para aquele dia.
                        */}
                        Horas Trabalhadas {viewDate === getTodayISOString() ? "Hoje" : "no Dia"}: {formatDuration(selectedDayData.totalMs)}
                    </p>
                </div>
                {/* --- 👆 FIM DO NOVO BLOCO 👆 --- */}
                                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="md:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                       <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100">Registrar Ponto</h2>
                       <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 bg-slate-50 dark:bg-gray-800/50 rounded-xl">
                            <div className="text-center sm:text-left">
                               <p className="text-sm text-slate-500 dark:text-slate-400">Próxima Ação:</p>
                               <p className={`text-2xl font-bold mt-1 ${nextPointType === 'finished' ? 'text-slate-500 dark:text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}>{currentButton.label}</p>
                               <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Último: {lastPoint ? `${lastPoint.tipo} às ${formatTime(lastPoint.timestamp)}` : 'Nenhum registro hoje'}</p>
                            </div>
                                <button onClick={() => setActionToConfirm(nextPointType)} disabled={clockInLoading || (viewDate !== getTodayISOString())} className={`flex items-center justify-center w-full sm:w-auto px-6 py-3 rounded-lg text-white font-semibold transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${currentButton.color} disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-md`}>
                                {clockInLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <currentButton.icon className="w-5 h-5 mr-2" />}
                                {clockInLoading ? 'Processando...' : (viewDate !== getTodayISOString() ? 'Visualizando outro dia' : currentButton.label)}
                            </button>
                        </div>
                    </div>
                     <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                         <div className="flex justify-between items-center mb-2">
                             <label htmlFor="banco-date" className="text-sm font-medium text-slate-500 dark:text-slate-400">Banco de Horas do Dia:</label>
                             <input 
                                type="date"
                                id="banco-date"
                                value={viewDate}
                                onChange={(e) => setViewDate(e.target.value)}
                                className="p-1 text-sm border-none rounded-lg bg-slate-100 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                            />
                         </div>
                         <p className={`text-4xl font-bold mt-1 ${selectedDayBalanceMs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatDuration(selectedDayBalanceMs)}
                         </p>
                         <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">
                            Total Trabalhado no Dia: {formatDuration(selectedDayData.totalMs)}
                         </p>
                         <hr className="my-3 border-slate-200 dark:border-gray-700"/>
                         <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Saldo Total Acumulado:</p>
                         <p className={`text-lg font-bold ${totalBalanceMs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatDuration(totalBalanceMs)}
                         </p>
                    </div>
                </div>

                <section className="mb-8 bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                   <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center">
                       <Calendar className="w-5 h-5 mr-2 text-blue-500" />
                       Registros de {new Date(viewDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                   </h2>
                   <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hora</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                                {selectedDayData.points.length > 0 ? (
                                    selectedDayData.points.map(ponto => (
                                        <tr key={ponto.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3">
                                                <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[ponto.tipo]}`}>
                                                    {ponto.tipo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-200">
                                                {formatTime(ponto.timestamp)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="2" className="py-8 text-center text-slate-500 dark:text-slate-400">
                                            Nenhum registro encontrado para este dia.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                   </div>
                </section>

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
                                            <div className="text-sm font-medium text-slate-900 dark:text-slate-200">{sol.tipo === 'abono' ? 'Abono' : (sol.tipo === 'justificativa' ? 'Justificativa' : 'Mensagem')}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">{sol.dataOcorrencia}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                           <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status === 'ciente' ? 'Ciente pelo Gestor' : sol.status}
                                           </span>
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && <tr><td colSpan="2" className="py-8 text-center text-slate-500 dark:text-slate-400">Nenhuma solicitação encontrada.</td></tr>}
                            </tbody>
                        </table>
                   </div>
                </section>

                 <SolicitationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
                 <GlobalMessagesViewerModal 
                    isOpen={isNotificationListOpen} 
                    onClose={() => setIsNotificationListOpen(false)} 
                    messages={globalMessages}
                    role="servidor"
                    onDelete={() => {}} 
                    onViewReads={() => {}} 
                 />

                <ConfirmationModal
                    isOpen={!!actionToConfirm}
                    title="Confirmar Registro de Ponto"
                    message={`Tem certeza que deseja registrar sua ${actionToConfirm}?`}
                    onConfirm={handleConfirmPoint}
                    onCancel={() => setActionToConfirm(null)}
                    isLoading={clockInLoading}
                />
        </div>
    </div>
    );
};

const GestorDashboard = () => {
    const { user, db, handleLogout, unidades, globalMessages, allUsers } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loadingAction, setLoadingAction] = useState(null);
    const [viewingFile, setViewingFile] = useState(null);

    const [servidoresDaUnidade, setServidoresDaUnidade] = useState([]);
    const [pontosDosServidores, setPontosDosServidores] = useState({});
    const [loadingRegistros, setLoadingRegistros] = useState(true);

    const [selectedUnidadeId, setSelectedUnidadeId] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState(getTodayISOString());
    const [activeTab, setActiveTab] = useState('solicitacoes'); 

    const [isNotificationListOpen, setIsNotificationListOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastReadTimestamp = localStorage.getItem(`lastReadTimestamp_${user.uid}`) || 0;

    const [viewingMessageReads, setViewingMessageReads] = useState(null);

    // --- NOVO: State para o modal de edição de ponto ---
    const [editingPoint, setEditingPoint] = useState(null); // { ponto, servidorId, servidorNome }
    const [addingPointForUser, setAddingPointForUser] = useState(null); // <-- ADICIONE ESTA LINHA
    const [pointToDelete, setPointToDelete] = useState(null); // <-- ADICIONE ESTA LINHA
    const [isDeleting, setIsDeleting] = useState(false); // <-- ADICIONE ESTA LINHA

    // --- 👇 ADICIONE ESTES DOIS NOVOS ESTADOS 👇 ---
    const [viewingServerBalance, setViewingServerBalance] = useState(null); // Guarda o { id, nome, role } do servidor
    const [serverBalanceData, setServerBalanceData] = useState({ totalBalanceMs: 0, loading: false });
    // --- 👆 FIM DA ADIÇÃO 👆 ---

    // --- 👇 ADICIONE ESTES DOIS NOVOS ESTADOS 👇 ---
    const [solicitationToDelete, setSolicitationToDelete] = useState(null);
    const [isDeletingSolicitation, setIsDeletingSolicitation] = useState(false);
    // --- 👆 FIM DA ADIÇÃO 👆 ---

    const solicitacoesCollectionPath = useMemo(() => `artifacts/${appId}/public/data/solicitacoes`, []);

    useEffect(() => {
        if (!isFirebaseInitialized) return;

        const q = query(
            collection(db, solicitacoesCollectionPath),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [db, solicitacoesCollectionPath]);

    useEffect(() => {
        if (globalMessages.length > 0) {
            const newUnreadCount = globalMessages.filter(
                msg => msg.createdAt.toDate().getTime() > lastReadTimestamp
            ).length;
            setUnreadCount(newUnreadCount);
        }
    }, [globalMessages, lastReadTimestamp]);

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setLoadingRegistros(false);
            return;
        }

        // 1. CORREÇÃO DE FILTRO: 
        // Agora filtra por 'servidor' E 'estagiario'
        const servidoresFiltrados = allUsers.filter(
            u => u.role === 'servidor' || u.role === 'estagiario'
        );

        // 2. CORREÇÃO DE ORDEM:
        // Organiza a lista filtrada em ordem alfabética pelo nome
        servidoresFiltrados.sort((a, b) => {
            // Adiciona uma verificação para o caso de algum nome ser nulo
            const nomeA = a.nome || '';
            const nomeB = b.nome || '';
            return nomeA.localeCompare(nomeB);
        });

        setServidoresDaUnidade(servidoresFiltrados);

    }, [allUsers]);

    useEffect(() => {
        if (!isFirebaseInitialized || !selectedDate || servidoresDaUnidade.length === 0) {
            setLoadingRegistros(false); 
            setPontosDosServidores({}); // Limpa os pontos se não houver data ou servidores
            return;
        }

        const fetchPontosPorData = async () => {
            setLoadingRegistros(true);
            try {
                const date = new Date(selectedDate);
                date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
                const startOfDay = new Date(date.setHours(0, 0, 0, 0));
                const endOfDay = new Date(date.setHours(23, 59, 59, 999));

                const pontosMap = {};
                for (const servidor of servidoresDaUnidade) {
                    const pointCollectionPath = `artifacts/${appId}/users/${servidor.id}/registros_ponto`;

                    const qPontos = query(
                        collection(db, pointCollectionPath), 
                        where('timestamp', '>=', startOfDay),
                        where('timestamp', '<=', endOfDay),
                        orderBy('timestamp', 'desc') // Mantém a ordem DESC para exibir
                    );

                    const pontosSnapshot = await getDocs(qPontos);
                    pontosMap[servidor.id] = pontosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }
                setPontosDosServidores(pontosMap);

            } catch (error) {
                console.error("Erro ao buscar pontos por data:", error);
                setGlobalMessage({ 
                    type: 'error', 
                    title: 'Erro de Query', 
                    message: `Não foi possível buscar os registros. Pode ser necessário criar um índice no Firestore. Verifique o console (F12) para um link de criação de índice.` 
                });
            } finally {
                setLoadingRegistros(false);
            }
        };

        fetchPontosPorData();
    }, [db, selectedDate, servidoresDaUnidade, setGlobalMessage]);


    // --- 👇 ADICIONE ESTE NOVO useEffect PARA CALCULAR O SALDO TOTAL 👇 ---
    useEffect(() => {
        // Se nenhum servidor foi selecionado, não faz nada
        if (!viewingServerBalance) {
            return;
        }

        const fetchAndCalculateBalance = async () => {
            // 1. Mostra o spinner no modal
            setServerBalanceData({ totalBalanceMs: 0, loading: true });

            const serverId = viewingServerBalance.id;
            const serverRole = viewingServerBalance.role;
            const pointCollectionPath = `artifacts/${appId}/users/${serverId}/registros_ponto`;
            
            // 2. Busca TODOS os pontos deste servidor
            const qPoints = query(collection(db, pointCollectionPath), orderBy('timestamp', 'asc')); // ASC para facilitar o cálculo
            const pointsSnapshot = await getDocs(qPoints);
            const allPoints = pointsSnapshot.docs.map(doc => doc.data());

            // 3. Lógica de cálculo (IDÊNTICA ao ServidorDashboard)
            const summary = {};
            let totalBalanceMs = 0;

            allPoints.forEach(point => {
                const dateKey = formatDateOnly(point.timestamp);
                if (!summary[dateKey]) {
                    summary[dateKey] = { points: [], totalMs: 0, balanceMs: 0 };
                }
                summary[dateKey].points.push(point);
            });

            Object.keys(summary).sort().forEach(dateKey => {
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

                // Pega a meta de horas do servidor (estagiário ou não)
                const userTargetMs = getTargetHoursMs(serverRole);
                const lastPointOfDay = day.points[day.points.length - 1];

                // Só calcula saldo se o dia foi finalizado
                if (lastPointOfDay && lastPointOfDay.tipo === 'saida') {
                    day.balanceMs = totalWorkedMs - userTargetMs;
                    totalBalanceMs += day.balanceMs;
                }
            });

            // 4. Atualiza o estado com o saldo final e para o loading
            setServerBalanceData({ totalBalanceMs: totalBalanceMs, loading: false });
        };

        fetchAndCalculateBalance().catch(err => {
            console.error("Erro ao calcular saldo do servidor:", err);
            setGlobalMessage({ type: 'error', title: 'Erro de Cálculo', message: 'Não foi possível calcular o saldo.' });
            setServerBalanceData({ totalBalanceMs: 0, loading: false });
        });

    }, [viewingServerBalance, db, setGlobalMessage]); // Depende do servidor selecionado
// --- 👆 FIM DO NOVO useEffect 👆 ---

    const handleUpdatePointTime = async (newTime, observacao) => { 
            if (!editingPoint) return;

            const [hours, minutes] = newTime.split(':').map(Number);

            // Pega a data original (do dia selecionado) e aplica a nova hora/minuto
            const originalTimestamp = editingPoint.timestamp.toDate();
            const newDate = new Date(originalTimestamp);
            newDate.setHours(hours);
            newDate.setMinutes(minutes);

            const pointDocRef = doc(db, `artifacts/${appId}/users/${editingPoint.servidorId}/registros_ponto`, editingPoint.id);

            try {
                await updateDoc(pointDocRef, {
                    timestamp: newDate,
                    observacao: observacao || null // <-- ADICIONADO: Salva a observação
                });

                // Atualiza o state local para refletir a mudança imediatamente
                setPontosDosServidores(prevMap => ({
                    ...prevMap,
                    [editingPoint.servidorId]: prevMap[editingPoint.servidorId].map(p =>
                        p.id === editingPoint.id ? { ...p, timestamp: Timestamp.fromDate(newDate), observacao: observacao || null } : p // <-- MODIFICADO
                    ).sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate()) // Re-ordena DESC
                }));

                setGlobalMessage({ type: 'success', title: 'Sucesso', message: 'Registro de ponto atualizado.' });
                setEditingPoint(null);
            } catch (error) {
                console.error("Erro ao atualizar ponto:", error);
                setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível salvar a alteração: ${error.message}` });
            }
        };
    // --- 👆 FIM DA FUNÇÃO QUE FALTAVA 👆 ---

// --- FUNÇÃO ATUALIZADA: Salva a hora e a observação ---
    // --- 👇 COLE A NOVA FUNÇÃO AQUI 👇 ---
   const handleManuallyAddPoint = async (tipo, newTime, observacao) => {
        if (!addingPointForUser || !selectedDate) return;

        const { id: servidorId, unidadeId } = addingPointForUser;

        // 1. Criar o novo Timestamp
        // O input 'date' (selectedDate) nos dá YYYY-MM-DD
        // O input 'time' (newTime) nos dá HH:MM
        // Juntamos os dois para criar um Date local
        const newDate = new Date(`${selectedDate}T${newTime}:00`);

        const pointCollectionPath = `artifacts/${appId}/users/${servidorId}/registros_ponto`;

        try {
            // 2. Adicionar o novo documento
            const newDocRef = await addDoc(collection(db, pointCollectionPath), {
                userId: servidorId,
                unidadeId: unidadeId || null,
                timestamp: newDate, // Salva como Timestamp
                tipo: tipo,
                observacao: `(Manual por ${user.nome}): ${observacao}` // Adiciona quem lançou
            });

            // 3. Atualizar a UI localmente (para não precisar recarregar)
            const newPoint = {
                id: newDocRef.id,
                userId: servidorId,
                unidadeId: unidadeId || null,
                timestamp: Timestamp.fromDate(newDate),
                tipo: tipo,
                observacao: `(Manual por ${user.nome}): ${observacao}`
            };

            setPontosDosServidores(prevMap => {
                const userPoints = prevMap[servidorId] || [];
                const updatedPoints = [...userPoints, newPoint];
                // Reordena para manter o mais recente em cima
                updatedPoints.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
                return {
                    ...prevMap,
                    [servidorId]: updatedPoints
                };
            });

            setGlobalMessage({ type: 'success', title: 'Sucesso', message: 'Registro de ponto adicionado manualmente.' });
            setAddingPointForUser(null); // Fecha o modal
        } catch (error) {
            console.error("Erro ao adicionar ponto manual:", error);
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível salvar o registro: ${error.message}` });
        }
    };
    // --- 👆 FIM DA NOVA FUNÇÃO 👆 ---

    // --- 👇 COLE A NOVA FUNÇÃO DE EXCLUSÃO AQUI 👇 ---
    const handleDeletePoint = async () => {
        if (!pointToDelete) return;
        setIsDeleting(true);

        const { id: pontoId, servidorId } = pointToDelete;
        const pointDocRef = doc(db, `artifacts/${appId}/users/${servidorId}/registros_ponto`, pontoId);

        try {
            await deleteDoc(pointDocRef);
            
            // Atualiza a UI localmente para remover o ponto
            setPontosDosServidores(prevMap => ({
                ...prevMap,
                [servidorId]: prevMap[servidorId].filter(p => p.id !== pontoId)
            }));
            
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: 'Registro de ponto excluído.' });
            setPointToDelete(null);
        } catch (error) {
            console.error("Erro ao excluir ponto:", error);
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível excluir o registro: ${error.message}` });
        } finally {
            setIsDeleting(false);
        }
    };
    // --- 👆 FIM DA NOVA FUNÇÃO 👆 ---

    // --- 👇 COLE A NOVA FUNÇÃO DE EXCLUIR SOLICITAÇÃO AQUI 👇 ---
    const handleDeleteSolicitation = async () => {
        if (!solicitationToDelete) return;
        setIsDeletingSolicitation(true);

        const solDocRef = doc(db, solicitacoesCollectionPath, solicitationToDelete.id);

        try {
            await deleteDoc(solDocRef);
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: 'Solicitação excluída com sucesso.' });
            setSolicitationToDelete(null);
            // O 'onSnapshot' (linha 1378) vai atualizar a lista automaticamente.
        } catch (error) {
            console.error("Erro ao excluir solicitação:", error);
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível excluir: ${error.message}` });
        } finally {
            setIsDeletingSolicitation(false);
        }
    };
    // --- 👆 FIM DA NOVA FUNÇÃO 👆 ---

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

    const filteredServidores = useMemo(() => {
        return servidoresDaUnidade
            .filter(servidor => {
                if (selectedUnidadeId === 'all') return true; 
                if (selectedUnidadeId === 'null') return !servidor.unidadeId; 
                return servidor.unidadeId === selectedUnidadeId; 
            })
            .filter(servidor => {
                if (searchTerm.trim() === '') return true; 
                const nome = servidor.nome?.toLowerCase() || '';
                const matricula = servidor.matricula || '';
                const termo = searchTerm.toLowerCase();
                return nome.includes(termo) || matricula.includes(termo);
            });
    }, [servidoresDaUnidade, selectedUnidadeId, searchTerm]);

    const handleGerarRelatorio = async () => {
        setGlobalMessage({ type: 'success', title: 'Relatório', message: 'Gerando relatório, aguarde...' });

        if (filteredServidores.length === 0) {
             setGlobalMessage({ type: 'warning', title: 'Aviso', message: 'Nenhum servidor encontrado (com base nos filtros) para gerar relatório.' });
             return;
        }

        const doc = new jsPDF();

        let titulo = 'Relatório de Pontos';
        if (selectedUnidadeId !== 'all' && selectedUnidadeId !== 'null') {
            titulo = `Unidade: ${unidades[selectedUnidadeId]?.name}`;
        } else if (selectedUnidadeId === 'null') {
            titulo = 'Unidade: Servidores Sem Unidade';
        } else {
            titulo = 'Relatório de Todas as Unidades';
        }

        doc.text(titulo, 14, 16);
        doc.setFontSize(12);
        doc.text(`Data: ${new Date(selectedDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`, 14, 22);
        doc.setFontSize(10);
        doc.text(`Gerado por: ${user.nome} em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

        const corpoTabela = [];

        for (const servidor of filteredServidores) {
            const unidadeServidor = unidades[servidor.unidadeId]?.name || 'Sem Unidade';

            corpoTabela.push([
                { content: `Servidor: ${servidor.nome} (Mat: ${servidor.matricula}) - Unidade: ${unidadeServidor}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: '#f0f0f0' } }
            ]);

            const pontos = pontosDosServidores[servidor.id];
            if (!pontos || pontos.length === 0) {
                corpoTabela.push([{ content: 'Nenhum registro encontrado para esta data.', colSpan: 3, styles: { fontStyle: 'italic' } }]);
            } else {
                [...pontos].reverse().forEach(ponto => {
                    corpoTabela.push([
                        formatDateOnly(ponto.timestamp),
                        ponto.tipo,
                        formatTime(ponto.timestamp)
                    ]);
                });
            }
        }

        doc.autoTable({
            startY: 35,
            head: [['Data', 'Tipo', 'Hora']],
            body: corpoTabela,
            theme: 'striped',
            headStyles: { fillColor: [22, 160, 133] },
        });

        doc.save(`relatorio_pontos_${selectedDate}.pdf`);
    };

    const getFileNameFromUrl = (url) => {
         try {
             const decodedUrl = decodeURIComponent(url);
             return decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1);
         } catch (e) {
             return url.substring(url.lastIndexOf('/') + 1);
         }
    };

    const openNotificationList = () => {
        setIsNotificationListOpen(true);
        if (globalMessages.length > 0) {
            localStorage.setItem(`lastReadTimestamp_${user.uid}`, globalMessages[0].createdAt.toDate().getTime().toString());
        }
        setUnreadCount(0);
    };

    const handleDeleteMessage = async (messageId) => {
        if (!window.confirm("Tem certeza que deseja excluir esta mensagem global?")) return;

        try {
            const msgRef = doc(db, `artifacts/${appId}/public/data/global_messages`, messageId);
            await deleteDoc(msgRef);
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: 'Mensagem global excluída.' });
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível excluir a mensagem: ${error.message}` });
        }
    };

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center">
                            <User className="inline-block w-8 h-8 mr-3 text-blue-600" /> Painel do Gestor
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>.
                        </p>
                    </div>
                     <div className="flex items-center space-x-3 self-end sm:self-center">
                        <ThemeToggleButton />

                        <button
                            onClick={openNotificationList}
                            className="relative p-2 rounded-full bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Ver mensagens"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute top-0 right-0 block h-4 w-4 rounded-full bg-red-600 text-white text-xs font-bold text-center" style={{ fontSize: '0.6rem', lineHeight: '1rem' }}>
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30">
                            <LogOut className="w-4 h-4 mr-1.5" /> Sair
                        </button>
                    </div>
                </header>

                <div className="border-b mb-6 dark:border-gray-800">
                    <nav className="flex space-x-2">
                         <button onClick={() => setActiveTab('solicitacoes')} className={`flex items-center py-3 px-4 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'solicitacoes' ? 'text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-gray-800 border-b-2 border-blue-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-gray-800/50'}`}><Mail className="w-4 h-4 mr-2" /> Solicitações</button>
                         <button onClick={() => setActiveTab('registros')} className={`flex items-center py-3 px-4 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'registros' ? 'text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-gray-800 border-b-2 border-blue-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-gray-800/50'}`}><Clock className="w-4 h-4 mr-2" /> Registros de Ponto</button>
                         <button onClick={() => setActiveTab('messages')} className={`flex items-center py-3 px-4 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'messages' ? 'text-blue-600 dark:text-blue-400 bg-slate-100 dark:bg-gray-800 border-b-2 border-blue-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-gray-800/50'}`}><MessageSquare className="w-4 h-4 mr-2" /> Mensagem Global</button>
                    </nav>
                </div>

                {activeTab === 'solicitacoes' && (
                    <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center">
                                <Mail className="w-5 h-5 mr-2 text-amber-500" />
                                Caixa de Solicitações ({solicitacoes.filter(s => s.status === 'pendente').length} pendentes)
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="border-b border-slate-200 dark:border-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Servidor</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unidade</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo/Data</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Justificativa</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status/Ações</th>
                                    </tr>
                                </thead>
                               <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                                    {/* INÍCIO DA CORREÇÃO */}
                                    {solicitacoes.length > 0 ? (
                                        solicitacoes.map(sol => (
                                            <tr key={sol.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                                <td className="px-4 py-4"><span className="text-sm font-medium text-slate-800 dark:text-slate-200">{sol.requesterNome}</span></td>
                                                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">{unidades[sol.unidadeId]?.name || 'N/A'}</td>
                                                <td className="px-4 py-4">
                                                    <div className="font-semibold text-sm block">{sol.tipo === 'abono' ? 'Abono' : (sol.tipo === 'justificativa' ? 'Justificativa' : 'Mensagem')}
                                                    </div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{sol.dataOcorrencia}</div>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300 max-w-xs">
                                                    <p className="truncate" title={sol.justificativaTexto}>{sol.justificativaTexto}</p>
                                                    {sol.anexoUrl &&
                                                        <button onClick={() => setViewingFile({ 
                                                                    url: sol.anexoUrl, 
                                                                    name: sol.anexoNome || getFileNameFromUrl(sol.anexoUrl)
                                                                })} 
                                                                className="text-blue-600 text-xs block mt-1 flex items-center hover:underline">
                                                            <File className="w-3 h-3 mr-1" /> Ver Anexo
                                                        </button>
                                                    }
                                                </td>
                                                <td className="px-4 py-4">
                                            {/* SE ESTIVER PENDENTE, DECIDIR OS BOTÕES */}
                                            {sol.status === 'pendente' ? (
                                                
                                                // SE FOR MENSAGEM, MOSTRAR "DAR CIÊNCIA"
                                                sol.tipo === 'mensagem' ? (
                                                    <div className="flex items-center space-x-2"> {/* Adicionado space-x-2 */}
                                                        <button 
                                                            onClick={() => handleAction(sol.id, 'ciente')} 
                                                            disabled={!!loadingAction} 
                                                            className="py-1 px-3 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300"
                                                        >
                                                            {loadingAction === sol.id + 'ciente' ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Marcar como Ciente'}
                                                        </button>
                                                        {/* --- Botão Excluir (para 'mensagem') --- */}
                                                        <button onClick={() => setSolicitationToDelete(sol)} className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" title="Excluir Solicitação">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                // SENÃO (abono/justificativa), MOSTRAR "APROVAR/REPROVAR"
                                                    <div className="flex items-center space-x-2">
                                                        <button onClick={() => handleAction(sol.id, 'aprovado')} disabled={!!loadingAction} className="py-1 px-3 rounded-full text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-300">
                                                            {loadingAction === sol.id + 'aprovado' ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Aprovar'}
                                                        </button>
                                                        <button onClick={() => handleAction(sol.id, 'reprovado')} disabled={!!loadingAction} className="py-1 px-3 rounded-full text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300">
                                                            {loadingAction === sol.id + 'reprovado' ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Reprovar'}
                                                        </button>
                                                        {/* --- Botão Excluir (para 'abono/justif') --- */}
                                                        <button onClick={() => setSolicitationToDelete(sol)} className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" title="Excluir Solicitação">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )

                                            ) : (
                                                // SE NÃO ESTIVER PENDENTE, MOSTRAR O BADGE (com o novo texto)
                                                <div className="flex items-center space-x-2">
                                                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>
                                                        {sol.status === 'ciente' ? 'Ciente pelo Gestor' : sol.status}
                                                    </span>
                                                    {/* --- Botão Excluir (para 'já resolvidos') --- */}
                                                    <button onClick={() => setSolicitationToDelete(sol)} className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" title="Excluir Solicitação">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="5" className="py-8 text-center text-slate-500 dark:text-slate-400">Nenhuma solicitação pendente.</td></tr>
                                    )}
                                    {/* FIM DA CORREÇÃO */}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === 'registros' && (
                    <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center">
                                <Clock className="w-5 h-5 mr-2 text-blue-500" />
                                Registros de Ponto
                            </h2>
                            <button
                                onClick={handleGerarRelatorio} 
                                className="flex items-center text-sm font-medium bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 shadow-sm transition w-full sm:w-auto"
                            >
                                <FileText className="w-4 h-4 mr-2" /> Gerar Relatório de Pontos
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="flex-1">
                                <label htmlFor="unitFilter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Filtrar por Unidade</label>
                                <select
                                    id="unitFilter"
                                    value={selectedUnidadeId}
                                    onChange={(e) => setSelectedUnidadeId(e.target.value)}
                                    className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">Todas as Unidades</option>
                                    <option value="null">Sem Unidade</option>
                                    {Object.entries(unidades).map(([id, unit]) => (
                                        <option key={id} value={id}>{unit.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1">
                                <label htmlFor="searchFilter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Buscar Servidor</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        id="searchFilter"
                                        placeholder="Buscar por nome ou matrícula..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full p-2 border rounded-lg pl-10 bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                </div>
                            </div>
                            <div className="flex-1 sm:flex-none">
                                <label htmlFor="dateFilter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data</label>
                                <input
                                    type="date"
                                    id="dateFilter"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full p-2 border rounded-lg bg-slate-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {loadingRegistros ? (
                            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></div>
                        ) : (
                            <div className="space-y-6">
                                {filteredServidores.length === 0 ? (
                                    <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                                        {searchTerm ? 'Nenhum servidor encontrado para sua busca.' : 'Nenhum servidor encontrado.'}
                                    </p>
                                ) : (
                                    filteredServidores.map(servidor => (
                                        <div key={servidor.id}>
                                            {/* ...POR ESTE BLOCO DE CÓDIGO: */}
                                            {/* MUDANÇAS DE LAYOUT:
                                            - flex-col sm:flex-row: Empilha em telas pequenas (coluna), fica lado a lado (row) em telas 'sm' (pequenas) ou maiores.
                                            - sm:justify-between sm:items-center: Aplica o alinhamento lado a lado apenas em telas 'sm' ou maiores.
                                            - gap-2 sm:gap-0: Adiciona um espaço de 2 unidades quando estão empilhados.
                                        */}
                                            {/* Container principal: 
                                            - flex-wrap: Permite que os botões pulem para a próxima linha em telas pequenas.
                                            - justify-between: Coloca o nome na esquerda e os botões na direita.
                                            - items-center: Alinha verticalmente o nome e os botões.
                                            - gap-3: Adiciona um espaço entre os itens.
                                        */}
                                        <div className="flex flex-wrap justify-between items-center gap-3">
                                            {/* Item 1: O Nome */}
                                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                                                {servidor.nome}
                                            </h3>
                                            
                                            {/* Item 2: Div dos Botões 
                                                - flex-shrink-0: Impede que os botões encolham ou quebrem linha, mantendo-os sempre juntos.
                                            */}
                                            <div className="flex items-center space-x-2 flex-shrink-0">
                                                <button
                                                    onClick={() => setViewingServerBalance(servidor)}
                                                    className="flex items-center text-xs font-medium bg-blue-600 text-white py-1 px-3 rounded-lg hover:bg-blue-700 shadow-sm transition"
                                                >
                                                    <Clock className="w-4 h-4 mr-1" /> Ver Saldo Total
                                                </button>

                                                <button
                                                    onClick={() => setAddingPointForUser({ id: servidor.id, nome: servidor.nome, unidadeId: servidor.unidadeId })}
                                                    className="flex items-center text-xs font-medium bg-emerald-600 text-white py-1 px-3 rounded-lg hover:bg-emerald-700 shadow-sm transition"
                                                >
                                                    <Plus className="w-4 h-4 mr-1" /> Adicionar Registro
                                                </button>
                                            </div>
                                        </div>
                                            {/* FIM DA SUBSTITUIÇÃO */}
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                                                Matrícula: {servidor.matricula} | Unidade: {unidades[servidor.unidadeId]?.name || 'N/A'}
                                            </p>
                                            <div className="overflow-x-auto border rounded-lg dark:border-gray-800">
                                                <table className="min-w-full">
                                                    <thead className="bg-slate-50 dark:bg-gray-800/50">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Data</th>
                                                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Tipo</th>
                                                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Hora</th>
                                                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Observação</th> {/* <-- ADICIONADO */}
                                                            <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Ações</th>
                                                        </tr>
                                                    </thead>
                                                   <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                                                        {pontosDosServidores[servidor.id] && pontosDosServidores[servidor.id].length > 0 ? (
                                                            pontosDosServidores[servidor.id].map(ponto => (
                                                                <tr key={ponto.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                                                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{formatDateOnly(ponto.timestamp)}</td>
                                                                    <td className="px-4 py-3 text-sm">
                                                                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[ponto.tipo] || 'bg-gray-200 text-gray-800'}`}>
                                                                            {ponto.tipo}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{formatTime(ponto.timestamp)}</td>
                                                                    {/* --- COLUNA DE OBSERVAÇÃO ADICIONADA --- */}
                                                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400" title={ponto.observacao}>
                                                                        {ponto.observacao ? (ponto.observacao.length > 20 ? ponto.observacao.substring(0, 20) + '...' : ponto.observacao) : '---'}
                                                                    </td>
                                                                    {/* --- FIM DA COLUNA ADICIONADA --- */}
                                                                    <td className="px-4 py-3 text-right">
                                                                        <button 
                                                                            onClick={() => setEditingPoint({ ...ponto, servidorId: servidor.id, servidorNome: servidor.nome })}
                                                                            className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                                            title="Ajustar horário"
                                                                        >
                                                                            <Edit3 className="w-4 h-4" />
                                                                        </button>
                                                                        {/* --- 2. 👇 COLE O NOVO BOTÃO DE EXCLUIR AQUI 👇 --- */}
                                                                    <button 
                                                                        onClick={() => setPointToDelete({ ...ponto, servidorId: servidor.id })}
                                                                        className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                                                        title="Excluir registro"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    {/* --- 👆 FIM DO NOVO BOTÃO 👆 --- */}
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        ) : (
                                                            <tr>
                                                                <td colSpan="5" className="px-4 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                                                                    Nenhum registro de ponto para esta data.
                                                                </td>
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
                )}

                {activeTab === 'messages' && (
                    <GlobalMessagesManager role="gestor" />
                )}

                <FileViewerModal isOpen={!!viewingFile} onClose={() => setViewingFile(null)} fileUrl={viewingFile?.url} fileName={viewingFile?.name} />
                <GlobalMessagesViewerModal 
                    isOpen={isNotificationListOpen} 
                    onClose={() => setIsNotificationListOpen(false)} 
                    messages={globalMessages}
                    role="gestor"
                    allUsers={allUsers}
                    onDelete={handleDeleteMessage}
                    onViewReads={setViewingMessageReads}
                />
                <MessageReadStatusModal
                    isOpen={!!viewingMessageReads}
                    onClose={() => setViewingMessageReads(null)}
                    message={viewingMessageReads}
                />
                                                        
                {/* --- 👇 ADICIONE O NOVO MODAL AQUI 👇 --- */}
                <AddPointModal
                    isOpen={!!addingPointForUser}
                    onClose={() => setAddingPointForUser(null)}
                    servidorNome={addingPointForUser?.nome}
                    selectedDate={selectedDate} // Passa a data selecionada no painel
                    onSave={handleManuallyAddPoint}
                />
                {/* --- 👆 FIM DA ADIÇÃO 👆 --- */}

        
                {/* --- 👇 ADICIONE O MODAL DE CONFIRMAÇÃO DE EXCLUSÃO 👇 --- */}
                <ConfirmationModal
                    isOpen={!!pointToDelete}
                    title="Confirmar Exclusão"
                    message={`Tem certeza que deseja excluir este registro de ${pointToDelete?.tipo} (${formatTime(pointToDelete?.timestamp)})? Esta ação é irreversível.`}
                    onConfirm={handleDeletePoint}
                    onCancel={() => setPointToDelete(null)}
                    isLoading={isDeleting}
                />
                {/* --- 👇 ADICIONE O NOVO MODAL DE SALDO AQUI 👇 --- */}
                <ServerBalanceModal
                    isOpen={!!viewingServerBalance}
                    onClose={() => setViewingServerBalance(null)}
                    serverName={viewingServerBalance?.nome}
                    balanceData={serverBalanceData}
                />
                {/* --- 👆 FIM DA ADIÇÃO 👆 --- */}

                {/* --- 👇 ADICIONE O NOVO MODAL DE EXCLUSÃO DE SOLICITAÇÃO AQUI 👇 --- */}
                <ConfirmationModal
                    isOpen={!!solicitationToDelete}
                    title="Excluir Solicitação"
                    message={`Tem certeza que deseja excluir esta solicitação de "${solicitationToDelete?.tipo}"? Esta ação é irreversível.`}
                    onConfirm={handleDeleteSolicitation}
                    onCancel={() => setSolicitationToDelete(null)}
                    isLoading={isDeletingSolicitation}
                />
                {/* --- 👆 FIM DA ADIÇÃO 👆 --- */}
            </div>
        </div>
    );
};

// --- *** ATUALIZADO *** UserManagement (Correção Vercel) ---
const UserManagement = () => {
    const { db, unidades, allUsers } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const usersCollectionPath = `artifacts/${appId}/public/data/${USER_COLLECTION}`;

    // --- CORREÇÃO VERCEL: 'setAllUsers' removido ---
    useEffect(() => {
        // Apenas define loading como 'false' quando 'allUsers' (do contexto) for carregado
        // ou se o firebase não estiver inicializado (modo demo)
        if (allUsers.length > 0 || !isFirebaseInitialized) {
            setLoading(false);
        }
    }, [allUsers]);
    // --- FIM DA CORREÇÃO ---


    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUser || !isFirebaseInitialized) return;
        setIsSubmitting(true);
        try {
            const userDocRef = doc(db, usersCollectionPath, editingUser.id);
            await updateDoc(userDocRef, {
                role: editingUser.role,
                unidadeId: editingUser.unidadeId || null, 
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

    const filteredUsers = allUsers.filter(u => u.nome?.toLowerCase().includes(searchTerm.toLowerCase()) || u.matricula?.toLowerCase().includes(searchTerm.toLowerCase()));
    const roleMap = { 'servidor': 'Servidor', 'estagiario': 'Estagiário', 'gestor': 'Gestor', 'rh': 'RH/Admin' };

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
                                    <option value="estagiario">Estagiário</option> {/* <-- ADICIONADO */}
                                    <option value="gestor">Gestor</option>
                                    <option value="rh">RH/Admin</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium dark:text-slate-300">Unidade</label>
                                <select name="unidadeId" value={editingUser.unidadeId || ''} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                                    <option value="">Sem Unidade</option>
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
    const [, setLoading] = useState(true);
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
                        {units.map(unit => (
                            <tr key={unit.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-200">{unit.name}</td>
                                <td className="px-4 py-3 text-right space-x-2">
                                    <button onClick={() => setUnitToEdit(unit)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-1"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => setUnitToDelete(unit)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <UnitManagementModal isOpen={!!unitToEdit} onClose={() => setUnitToEdit(null)} onSave={handleSaveUnit} unit={unitToEdit} setUnit={setUnitToEdit} isLoading={isSubmitting} />
            <ConfirmationModal isOpen={!!unitToDelete} title="Confirmar Exclusão" message={`Deseja realmente excluir a unidade "${unitToDelete?.name}"?`} onConfirm={handleDeleteUnit} onCancel={() => setUnitToDelete(null)} isLoading={isSubmitting}/>
        </div>
    );
};

// --- Componente de Gerenciamento de Mensagens (Reutilizável) ---
const GlobalMessagesManager = ({ role }) => {
    const { user: currentUser, db, globalMessages } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [viewingMessageReads, setViewingMessageReads] = useState(null);
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
                readBy: {}, // Inicia campo de leituras
            });
            setGlobalMessage({ type: 'success', title: 'Mensagem Enviada', message: 'Sua mensagem foi enviada para todos os usuários.' });
            setMessage('');
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: 'Falha ao enviar mensagem.' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMessage = async (messageId) => {
        if (!window.confirm("Tem certeza que deseja excluir esta mensagem global?")) return;

        try {
            const msgRef = doc(db, messagesCollectionPath, messageId);
            await deleteDoc(msgRef);
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: 'Mensagem global excluída.' });
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Não foi possível excluir a mensagem: ${error.message}` });
        }
    };

    return (
        <div className="space-y-6">
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

            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
                 <h3 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100">Histórico de Mensagens</h3>
                 <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {globalMessages.length === 0 ? (
                            <p className="text-slate-500 dark:text-slate-400 text-center py-8">Nenhuma mensagem global encontrada.</p>
                        ) : (
                            globalMessages.map(msg => {
                                const readCount = msg.readBy ? Object.keys(msg.readBy).length : 0;
                                return (
                                    <div key={msg.id} className="p-4 bg-slate-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Enviada por: <span className="font-medium">{msg.senderName} ({msg.senderRole})</span>
                                        </p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Em: {formatDateOnly(msg.createdAt)} às {formatTime(msg.createdAt)}
                                        </p>
                                        <p className="mt-3 text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{msg.text}</p>

                                        <div className="flex items-center justify-between mt-4 pt-3 border-t dark:border-gray-700">
                                            <button 
                                                onClick={() => setViewingMessageReads(msg)}
                                                className="flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                <Eye className="w-4 h-4 mr-1" />
                                                Visualizado por {readCount}
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteMessage(msg.id)}
                                                className="flex items-center text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                Excluir
                                            </button>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                 </div>
            </div>

            <MessageReadStatusModal
                isOpen={!!viewingMessageReads}
                onClose={() => setViewingMessageReads(null)}
                message={viewingMessageReads}
            />
        </div>
    );
};

const RHAdminDashboard = () => {
    const { user, handleLogout } = useAuthContext();
    const [activeTab, setActiveTab] = useState('users');
    const roleMap = { 'servidor': 'Servidor', 'estagiario': 'Estagiário', 'gestor': 'Gestor', 'rh': 'RH/Admin' };

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
                {activeTab === 'messages' && <GlobalMessagesManager role="rh" />}
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
    const { user, role, isLoading, globalMessages, db } = useAuthContext();
    const [authView, setAuthView] = useState('login'); // 'login', 'signup', or 'forgotPassword'

    const [newestMessage, setNewestMessage] = useState(null);
    const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);

    // Verifica novas mensagens ao logar ou quando novas mensagens chegam
    useEffect(() => {
        if (!user || globalMessages.length === 0) {
            return;
        }

        const lastReadTimestamp = localStorage.getItem(`lastReadTimestamp_${user.uid}`) || 0;
        const newestMsg = globalMessages[0];

        if (newestMsg.createdAt.toDate().getTime() > lastReadTimestamp) {
            const alreadyRead = newestMsg.readBy && newestMsg.readBy[user.uid];

            if (!alreadyRead) {
                setNewestMessage(newestMsg);
                setIsNewMessageModalOpen(true);
            }
        }

    }, [globalMessages, user]);

    // Marca a mensagem como ciente no Firestore
    const handleAcknowledgeMessage = async (messageId) => {
        if (!messageId || !user) return;

        // Salva no localStorage (para o pop-up imediato)
        const timestamp = newestMessage.createdAt.toDate().getTime().toString();
        localStorage.setItem(`lastReadTimestamp_${user.uid}`, timestamp);

        // Salva no Firestore (para o Admin/Gestor ver)
        try {
            const msgRef = doc(db, `artifacts/${appId}/public/data/global_messages`, messageId);
            await updateDoc(msgRef, {
                // Usamos a notação de ponto para atualizar um campo dentro de um map
                [`readBy.${user.uid}`]: {
                    nome: user.nome,
                    matricula: user.matricula,
                    readAt: new Date()
                }
            });
        } catch (error) {
            console.error("Erro ao marcar mensagem como cida:", error);
        }

        setIsNewMessageModalOpen(false);
        setNewestMessage(null);
    };

    if (isLoading) {
        return <LoadingScreen />;
    }

    const dashboardMap = {
        servidor: <ServidorDashboard />,
        estagiario: <ServidorDashboard />, // <-- ADICIONE ESTA LINHA
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

                <NewMessageModal 
                    isOpen={isNewMessageModalOpen}
                    onClose={() => setIsNewMessageModalOpen(false)} // Fechar sem marcar como lido (pelo 'X')
                    message={newestMessage}
                    onAcknowledge={handleAcknowledgeMessage} // Clicar em "Entendido"
                />
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
