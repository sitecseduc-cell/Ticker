/* global __app_id, __firebase_config */
import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import {
    getFirestore, doc, setDoc, collection, query, where, orderBy, onSnapshot,
    addDoc, getDoc, updateDoc, deleteDoc, getDocs
} from 'firebase/firestore';
import {
    LogIn, LogOut, Clock, User, Briefcase, RefreshCcw, Loader2, CheckCircle,
    AlertTriangle, XCircle, Pause, Mail, Users, FileText, Edit,
    Trash2, X, File, Send, Search, Plus, Home, MessageSquare, Sun, Moon
} from 'lucide-react';

// --- /src/firebase/config.js (Simulado) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'secretaria-educacao-ponto-demo';
const firebaseConfigJSON = typeof __firebase_config !== 'undefined' ? __firebase_config : null;

let app, auth, db;
let isFirebaseInitialized = false;

try {
    if (firebaseConfigJSON) {
        const firebaseConfig = JSON.parse(firebaseConfigJSON);
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        isFirebaseInitialized = true;
    } else {
        console.warn("Configuração do Firebase não encontrada. Usando modo de demonstração.");
        app = {}; auth = {}; db = null;
    }
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
    app = {}; auth = {}; db = null;
}

// --- Dados de Demonstração ---
const DUMMY_ACCOUNTS = {
    'rh@edu.br': { email: 'rh@edu.br', password: '123', role: 'rh', nome: 'Admin RH', unidadeId: 'unidade-adm-01', matricula: '10001' },
    'gestor@edu.br': { email: 'gestor@edu.br', password: '123', role: 'gestor', nome: 'Diretor da Unidade', unidadeId: 'unidade-adm-01', matricula: '20002' },
    'servidor@edu.br': { email: 'servidor@edu.br', password: '123', role: 'servidor', nome: 'Ana Servidora', unidadeId: 'unidade-adm-01', matricula: '30003' },
    'estagiario@edu.br': { email: 'estagiario@edu.br', password: '123', role: 'servidor', nome: 'Pedro Estagiário', unidadeId: 'unidade-adm-01', matricula: '40004' }
};

// --- Constantes ---
const STATUS_COLORS = {
    entrada: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400',
    saida: 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300',
    pausa: 'text-amber-600 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400',
    volta: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-400',
    finished: 'text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-400',
    pendente: 'text-amber-600 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400',
    aprovado: 'text-green-600 bg-green-100 dark:bg-green-900/50 dark:text-green-400',
    reprovado: 'text-red-600 bg-red-100 dark:bg-red-900/50 dark:text-red-400',
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
        const q = query(collection(db, `/artifacts/${appId}/public/data/${UNIT_COLLECTION}`));
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
                const userDocRef = doc(db, 'artifacts', appId, USER_COLLECTION, firebaseUser.uid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    setUser({ uid: firebaseUser.uid, ...userSnap.data() });
                } else {
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
    
    const handleLogin = useCallback(async (matricula, password) => {
        const demoAccount = Object.values(DUMMY_ACCOUNTS).find(acc => acc.matricula === matricula);
        if (demoAccount && demoAccount.password === password) {
            setUser({ uid: demoAccount.matricula, ...demoAccount });
            return;
        }

        if (!isFirebaseInitialized) {
            throw new Error('Matrícula ou senha incorretos.');
        }

        try {
            const usersRef = collection(db, 'artifacts', appId, USER_COLLECTION);
            const q = query(usersRef, where("matricula", "==", matricula));
            const querySnapshot = await getDocs(q);
    
            if (querySnapshot.empty) {
                throw new Error("Matrícula ou senha incorretos.");
            }
    
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();
            const userEmail = userData.email; 
    
            if (!userEmail) {
                console.error("O documento do usuário não possui o campo de email:", userDoc.id);
                throw new Error("Falha no login. O perfil do usuário está incompleto.");
            }
    
            await signInWithEmailAndPassword(auth, userEmail, password);

        } catch(error) {
             console.error("Firebase login failed:", error);
             throw new Error("Matrícula ou senha incorretos.");
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
        db,
        auth
    }), [user, isLoading, unidades, handleLogin, handleLogout]);

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
            className="p-2 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
            aria-label="Alternar tema"
        >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
    );
};

const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-slate-900">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="mt-4 text-lg font-medium text-gray-700 dark:text-gray-300">Carregando sistema...</p>
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

    const iconMap = {
        success: <CheckCircle className="w-6 h-6 text-green-500" />,
        error: <XCircle className="w-6 h-6 text-red-500" />,
        warning: <AlertTriangle className="w-6 h-6 text-yellow-500" />,
    };

    return (
        <div className="fixed top-5 right-5 w-full max-w-sm z-[100]">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-950/50 border dark:border-slate-700 p-4 flex items-start space-x-3">
                {iconMap[message.type]}
                <div className="flex-1">
                    <p className="font-bold text-gray-800 dark:text-gray-100">{message.title}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{message.message}</p>
                </div>
                <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, isLoading }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 dark:bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" /> {title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mt-2">{message}</p>
                <div className="flex justify-end space-x-3 mt-6">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600 transition">Cancelar</button>
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
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Visualizar Anexo</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Nome do arquivo: {fileName}</p>
                <div className="mt-4 p-4 border rounded-lg text-center bg-gray-50 dark:bg-slate-700 dark:border-slate-600">
                    <p className="font-semibold dark:text-gray-200">Visualização de anexo simulada.</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Em um ambiente de produção, o arquivo seria exibido aqui.</p>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-blue-600 hover:underline text-xs break-all">
                        URL simulada: {fileUrl}
                    </a>
                </div>
                <button onClick={onClose} className="mt-6 w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Fechar</button>
            </div>
        </div>
    );
};

const LoginScreen = () => {
    const { handleLogin } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [matricula, setMatricula] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const onLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await handleLogin(matricula, password);
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Falha no Login', message: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
            <div className="absolute top-4 right-4">
                <ThemeToggleButton />
            </div>
            <div className="flex flex-col items-center mb-6">
                 <h2 className="text-2xl font-bold dark:text-gray-100">Acesso ao Ponto</h2>
                 <img src="https://i.ibb.co/932Mzz8w/SITECicone.png" alt="Logo Sitec" className="logo mt-4" style={{ width: '70px', height: '70px' }} />
            </div>
            <form onSubmit={onLogin} className="space-y-4">
                 <input type="text" placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} required className="w-full p-3 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                 <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                 <button type="submit" disabled={loading} className="w-full py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-blue-400 flex justify-center items-center">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Entrar'}
                 </button>
            </form>
             <div className="mt-4 text-center text-sm">
                <button className="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400">Esqueceu a Senha?</button>
            </div>
             <div className="mt-6 pt-4 border-t dark:border-slate-700">
                <h3 className="text-sm font-semibold mb-2 dark:text-gray-300">Contas de Demonstração (Senha: 123)</h3>
                <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                    <li><span className="font-semibold">RH/Admin:</span> 10001</li>
                    <li><span className="font-semibold">Gestor:</span> 20002</li>
                    <li><span className="font-semibold">Servidor:</span> 30003</li>
                </ul>
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
    const sign = ms < 0 ? '-' : '';
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
       <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Nova Solicitação de Ponto</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Solicitação</label>
                        <select name="tipo" value={formData.tipo} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="abono">Abono (Ajuste de Registro)</option>
                            <option value="justificativa">Justificativa (Ausência)</option>
                        </select>
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data de Ocorrência</label>
                        <input type="date" name="dataOcorrencia" value={formData.dataOcorrencia} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"/>
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Descrição Detalhada</label>
                        <textarea name="justificativaTexto" value={formData.justificativaTexto} onChange={handleChange} rows="4" required className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"></textarea>
                    </div>
                    <div className="space-y-1 p-3 border border-dashed rounded-lg dark:border-slate-600">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Anexo (Opcional)</label>
                        <input type="file" name="anexoFile" onChange={handleChange} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/50 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/70"/>
                        {formData.anexoFile && <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center"><File className="w-4 h-4 mr-1"/>{formData.anexoFile.name}</p>}
                    </div>
                    <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400">
                        {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                        {loading ? 'Enviando...' : 'Enviar Solicitação'}
                    </button>
                </form>
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [solicitacoes, setSolicitacoes] = useState([]);

    const pointCollectionPath = useMemo(() => `/artifacts/${appId}/users/${userId}/registros_ponto`, [userId]);
    const solicitacoesCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);
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

    const buttonMap = {
        entrada: { label: 'Entrada', icon: LogIn, color: 'bg-emerald-500 hover:bg-emerald-600' },
        pausa: { label: 'Início Pausa', icon: Pause, color: 'bg-amber-500 hover:bg-amber-600' },
        volta: { label: 'Fim Pausa', icon: RefreshCcw, color: 'bg-indigo-500 hover:bg-indigo-600' },
        saida: { label: 'Saída', icon: LogOut, color: 'bg-gray-500 hover:bg-gray-600' },
        finished: { label: 'Expediente Finalizado', icon: Clock, color: 'bg-gray-400' },
    };
    const currentButton = buttonMap[nextPointType];

    return (
        <div className="p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 border-b pb-4 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                            <Clock className="w-8 h-8 mr-2 text-blue-500" />
                             Ponto Eletrônico
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                             Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>.
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Matrícula: {user.matricula} | Unidade: {unidadeNome}
                        </p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <ThemeToggleButton />
                        <button
                            onClick={handleLogout}
                            className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 transition duration-150 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                            <LogOut className="w-4 h-4 mr-1" />
                            Sair
                        </button>
                    </div>
                </header>

                <section className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg mb-8 border border-blue-100 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Saldo Acumulado (Banco de Horas)</p>
                        <p className={`text-4xl font-extrabold mt-1 ${dailySummary.totalBalanceMs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatDuration(dailySummary.totalBalanceMs)}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Jornada Padrão</p>
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">8h / dia</p>
                    </div>
                </section>

                <section className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg mb-8 border border-blue-100 dark:border-slate-700">
                   <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Registrar Ponto</h2>
                   <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
                        <div className="flex-1 text-center sm:text-left">
                           <p className="text-sm text-gray-500 dark:text-gray-400">Próximo Ponto:</p>
                           <p className={`text-4xl font-extrabold mt-1 ${nextPointType === 'finished' ? 'text-gray-500 dark:text-gray-400' : 'text-blue-600 dark:text-blue-400'}`}>{currentButton.label.toUpperCase()}</p>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Último: {lastPoint ? `${lastPoint.tipo.toUpperCase()} às ${formatTime(lastPoint.timestamp)}` : 'Nenhum'}</p>
                        </div>
                        <button onClick={() => registerPoint(nextPointType)} disabled={clockInLoading || nextPointType === 'finished'} className={`flex items-center justify-center w-full sm:w-auto px-8 py-3 rounded-full text-white font-semibold transition shadow-md ${currentButton.color} disabled:opacity-50 disabled:cursor-not-allowed`}>
                            {clockInLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <currentButton.icon className="w-5 h-5 mr-2" />}
                            {clockInLoading ? 'Processando...' : currentButton.label}
                        </button>
                    </div>
                </section>

                <section className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg mb-8 border dark:border-slate-700">
                   <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center">Minhas Solicitações</h2>
                   <div className="flex justify-end mb-4">
                        <button onClick={() => setIsModalOpen(true)} className="flex items-center text-sm font-medium bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 shadow-md">
                            <Send className="w-4 h-4 mr-1" /> Nova Solicitação
                        </button>
                   </div>
                   <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                            <thead className="bg-gray-50 dark:bg-slate-900/50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tipo/Data</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                                {solicitacoes.slice(0, 5).map(sol => (
                                    <tr key={sol.id}>
                                        <td className="px-3 py-3">
                                            <span className="text-sm font-bold block">{sol.tipo === 'abono' ? 'Abono' : 'Justificativa'}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{sol.dataOcorrencia}</span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status}</span>
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && <tr><td colSpan="2" className="py-4 text-center text-gray-500 dark:text-gray-400">Nenhuma solicitação.</td></tr>}
                            </tbody>
                        </table>
                   </div>
                </section>

                 <SolicitationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
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

    const solicitacoesCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);
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

    const handleAction = useCallback(async (solicitationId, newStatus) => {
        setLoadingAction(solicitationId);
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

    const getFileNameFromUrl = (url) => url.substring(url.lastIndexOf('/') + 1);

    return (
        <div className="p-4 sm:p-8">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 border-b pb-4 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                            <User className="inline-block w-8 h-8 mr-2 text-blue-500" /> Painel do Gestor
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>. Unidade: {unidadeNome}.
                        </p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <ThemeToggleButton />
                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                            <LogOut className="w-4 h-4 mr-1" /> Sair
                        </button>
                    </div>
                </header>

                <section className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-blue-100 dark:border-slate-700">
                    <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center">
                        <Mail className="w-5 h-5 mr-2 text-amber-500" />
                        Caixa de Solicitações ({solicitacoes.filter(s => s.status === 'pendente').length} pendentes)
                    </h2>

                    <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                            <thead className="bg-gray-50 dark:bg-slate-900/50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Servidor</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tipo/Data</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Justificativa</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status/Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                                {solicitacoes.map(sol => (
                                    <tr key={sol.id}>
                                        <td className="px-3 py-3"><span className="text-sm font-medium">{sol.requesterNome}</span></td>
                                        <td className="px-3 py-3">
                                            <span className="font-bold text-xs block">{sol.tipo.toUpperCase()}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{sol.dataOcorrencia}</span>
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate" title={sol.justificativaTexto}>
                                            {sol.justificativaTexto}
                                            {sol.anexoUrl &&
                                                <button onClick={() => setViewingFile({ url: sol.anexoUrl, name: getFileNameFromUrl(sol.anexoUrl) })} className="text-blue-500 text-xs block mt-1 flex items-center hover:underline">
                                                    <File className="w-3 h-3 mr-1" /> Ver Anexo
                                                </button>
                                            }
                                        </td>
                                        <td className="px-3 py-3 space-x-2">
                                            {sol.status === 'pendente' ? (
                                                <>
                                                    <button onClick={() => handleAction(sol.id, 'aprovado')} disabled={loadingAction === sol.id} className="py-1 px-3 rounded-full text-xs font-semibold bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-300">Aprovar</button>
                                                    <button onClick={() => handleAction(sol.id, 'reprovado')} disabled={loadingAction === sol.id} className="py-1 px-3 rounded-full text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:bg-gray-300">Reprovar</button>
                                                </>
                                            ) : (
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && <tr><td colSpan="4" className="py-4 text-center text-gray-500 dark:text-gray-400">Nenhuma solicitação.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

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

    const usersCollectionPath = `/artifacts/${appId}/${USER_COLLECTION}`;

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setUsers(Object.entries(DUMMY_ACCOUNTS).map(([email, data]) => ({ id: data.matricula, email, ...data })));
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
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-blue-100 dark:border-slate-700">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-500" /> Gestão de Usuários
            </h3>
            <div className="relative w-full mb-4">
                <input
                    type="text"
                    placeholder="Buscar por nome ou matrícula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                />
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            </div>
             {loading ? (
                 <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>
            ) : (
                 <div className="overflow-x-auto">
                     <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                         <thead className="bg-gray-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Matrícula/Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Perfil</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unidade</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ações</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                            {filteredUsers.map(user => (
                                <tr key={user.id}>
                                    <td className="px-4 py-3">
                                        <span className="text-sm font-medium block dark:text-gray-100">{user.nome}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Matrícula: {user.matricula}</span>
                                    </td>
                                    <td className="px-4 py-3"><span className="text-sm dark:text-gray-300">{roleMap[user.role] || user.role}</span></td>
                                    <td className="px-4 py-3 text-sm dark:text-gray-300">{unidades[user.unidadeId]?.name || 'N/A'}</td>
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
                 <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg">
                         <div className="p-6 border-b dark:border-slate-700">
                             <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Editar Usuário</h3>
                         </div>
                         <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                             <div>
                                 <label className="text-sm font-medium dark:text-gray-300">Nome</label>
                                 <input type="text" name="nome" value={editingUser.nome} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                             </div>
                             <div>
                                 <label className="text-sm font-medium dark:text-gray-300">Matrícula</label>
                                 <input type="text" name="matricula" value={editingUser.matricula} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                             </div>
                             <div>
                                 <label className="text-sm font-medium dark:text-gray-300">Perfil</label>
                                 <select name="role" value={editingUser.role} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                     <option value="servidor">Servidor</option>
                                     <option value="gestor">Gestor</option>
                                     <option value="rh">RH/Admin</option>
                                 </select>
                             </div>
                             <div>
                                 <label className="text-sm font-medium dark:text-gray-300">Unidade</label>
                                 <select name="unidadeId" value={editingUser.unidadeId} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                     {Object.entries(unidades).map(([id, unit]) => (
                                         <option key={id} value={id}>{unit.name}</option>
                                     ))}
                                 </select>
                             </div>
                             <div className="flex justify-end space-x-3 pt-4">
                                 <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 dark:bg-slate-600 dark:text-gray-200 rounded-lg">Cancelar</button>
                                 <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center disabled:bg-blue-300">
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
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
                 <div className="p-6 border-b dark:border-slate-700"><h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{unit.id ? 'Editar Unidade' : 'Adicionar Unidade'}</h3></div>
                 <form onSubmit={onSave} className="p-6 space-y-4">
                     <div>
                         <label className="text-sm font-medium dark:text-gray-300">Nome da Unidade</label>
                         <input type="text" name="name" value={unit.name} onChange={handleChange} className="w-full p-2 border rounded-lg mt-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
                     </div>
                     <div className="flex justify-end space-x-3 pt-4">
                         <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-slate-600 dark:text-gray-200 rounded-lg">Cancelar</button>
                         <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center disabled:bg-blue-300">
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
    const unitCollectionPath = `/artifacts/${appId}/public/data/${UNIT_COLLECTION}`;

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
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-blue-100 dark:border-slate-700">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xl font-semibold flex items-center dark:text-gray-100"><Home className="w-5 h-5 mr-2 text-blue-500" /> Gestão de Unidades</h3>
                 <button onClick={() => setUnitToEdit({ name: '' })} className="flex items-center text-sm font-medium bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"><Plus className="w-5 h-5 mr-1" /> Adicionar Unidade</button>
             </div>
             <div className="overflow-x-auto">
                 <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                     <thead className="bg-gray-50 dark:bg-slate-900/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nome da Unidade</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ações</th>
                        </tr>
                    </thead>
                     <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                        {units.map(unit => (
                            <tr key={unit.id}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-200">{unit.name}</td>
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

const MessageBoxForAllUsers = () => {
    const { user: currentUser, db } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesCollectionPath = `/artifacts/${appId}/public/data/global_messages`;

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
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-blue-100 dark:border-slate-700">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center"><MessageSquare className="w-5 h-5 mr-2 text-blue-500"/> Enviar Mensagem Global</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Envie uma notificação que aparecerá para todos os usuários ao entrarem no sistema.</p>
            <form onSubmit={handleSendMessage} className="space-y-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem aqui..." rows="4" required className="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"></textarea>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-2 px-4 rounded-lg text-white font-semibold bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400">
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
        <div className="p-4 sm:p-8">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 border-b dark:border-slate-700 pb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100"><Briefcase className="inline w-8 h-8 mr-2 text-blue-500" /> Painel de Administração (RH)</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">Bem-vindo(a), <span className="font-semibold text-blue-600 dark:text-blue-400">{user.nome}</span>. Perfil: {roleMap[user.role]}.</p>
                    </div>
                     <div className="flex items-center space-x-4">
                        <ThemeToggleButton />
                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><LogOut className="w-4 h-4 mr-1" /> Sair</button>
                    </div>
                </header>

                <div className="flex border-b mb-6 dark:border-slate-700">
                    <button onClick={() => setActiveTab('users')} className={`flex items-center py-3 px-6 text-sm font-medium transition-colors ${activeTab === 'users' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}><Users className="w-4 h-4 mr-2" /> Gestão de Usuários</button>
                    <button onClick={() => setActiveTab('units')} className={`flex items-center py-3 px-6 text-sm font-medium transition-colors ${activeTab === 'units' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}><Home className="w-4 h-4 mr-2" /> Gestão de Unidades</button>
                    <button onClick={() => setActiveTab('messages')} className={`flex items-center py-3 px-6 text-sm font-medium transition-colors ${activeTab === 'messages' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}><MessageSquare className="w-4 h-4 mr-2" /> Caixa de Mensagens</button>
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
        <footer className="w-full py-4 mt-auto text-center bg-gray-100 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
                © Criado por ISAAC.J.S.B | Desenvolvido por GIULIANO.L & HENRIQUE.B
            </p>
        </footer>
    );
};

const AppContent = () => {
    const { user, role, isLoading } = useAuthContext();

    if (isLoading) {
        return <LoadingScreen />;
    }
    
    const dashboardMap = {
        servidor: <ServidorDashboard />,
        gestor: <GestorDashboard />,
        rh: <RHAdminDashboard />
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
            <main className={`flex-grow ${!user ? 'flex items-center justify-center p-4' : ''}`}>
                {!user ? (
                    <LoginScreen />
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

