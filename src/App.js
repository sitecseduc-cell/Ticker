/* global __app_id, __firebase_config */
import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
    getFirestore, doc, collection, query, where, orderBy, onSnapshot,
    addDoc, getDoc, updateDoc, deleteDoc, getDocs, setDoc
} from 'firebase/firestore';
import {
    LogIn, LogOut, Clock, User, Briefcase, RefreshCcw, Loader2, CheckCircle,
    AlertTriangle, XCircle, Pause, Mail, Users, FileText, Edit,
    Trash2, X, File, Send, Search, Plus, Home, MessageSquare, Sun, Moon
} from 'lucide-react';

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
        // *** CORREÇÃO: Removido o segundo argumento '(default)' que não é necessário aqui ***
        db = getFirestore(app);
        isFirebaseInitialized = true;
        appId = firebaseConfig.projectId || 'secretaria-educacao-ponto-demo'; // Garante que appId tenha um valor
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
// *** CORREÇÃO: Removido USER_COLLECTION e UNIT_COLLECTION daqui, pois os caminhos completos serão definidos no AuthProvider ***

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

    // *** CORREÇÃO: Definindo os caminhos padronizados das coleções principais ***
    const usersCollectionPath = useMemo(() => `artifacts/${appId}/users`, [appId]);
    const publicDataPath = useMemo(() => `artifacts/${appId}/public/data`, [appId]);
    const unitsCollectionPath = useMemo(() => `${publicDataPath}/unidades`, [publicDataPath]);
    const solicitacoesCollectionPath = useMemo(() => `${publicDataPath}/solicitacoes`, [publicDataPath]);
    const globalMessagesCollectionPath = useMemo(() => `${publicDataPath}/global_messages`, [publicDataPath]);

    // Carregar unidades
    useEffect(() => {
        if (!isFirebaseInitialized || !db) { // Adicionado verificação de db
            setUnidades({
                'unidade-adm-01': { name: 'Controle e Movimentação (Demo)' },
                'unidade-esc-01': { name: 'Escola Municipal A (Demo)' },
            });
            return;
        }
        const q = query(collection(db, unitsCollectionPath));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const units = {};
            snapshot.forEach(doc => units[doc.id] = doc.data());
            setUnidades(units);
        }, (error) => { // Adicionado tratamento de erro para onSnapshot
            console.error("Erro ao carregar unidades:", error);
            setUnidades({}); // Resetar unidades em caso de erro
        });
        return () => unsubscribe();
    }, [db, unitsCollectionPath]); // Removido isFirebaseInitialized da dependência

    // Lógica de autenticação
    useEffect(() => {
        if (!isFirebaseInitialized || !auth || !db) { // Adicionado verificação de auth e db
            setIsLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // *** CORREÇÃO: Caminho correto para buscar dados do usuário ***
                const userDocRef = doc(db, usersCollectionPath, firebaseUser.uid);
                try {
                    const userSnap = await getDoc(userDocRef);
                    if (userSnap.exists()) {
                        setUser({ uid: firebaseUser.uid, ...userSnap.data() });
                    } else {
                        console.warn(`Usuário ${firebaseUser.uid} autenticado mas não encontrado no Firestore. Deslogando.`);
                        await signOut(auth);
                        setUser(null);
                    }
                } catch (error) {
                    console.error("Erro ao buscar dados do usuário no Firestore:", error);
                    await signOut(auth); // Deslogar em caso de erro ao buscar dados
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [db, auth, usersCollectionPath]); // Removido isFirebaseInitialized

    const handleSignUp = useCallback(async (nome, email, matricula, password) => {
        if (!isFirebaseInitialized || !auth || !db) { // Adicionado verificação
            throw new Error('O cadastro não está disponível no modo de demonstração ou Firebase não inicializado.');
        }

        try {
            // Check if matricula already exists
            const usersRef = collection(db, usersCollectionPath);
            const q = query(usersRef, where("matricula", "==", matricula));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                throw new Error("Esta matrícula já está em uso.");
            }

            // Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;

            // Save user details in Firestore
            // *** CORREÇÃO: Caminho correto para salvar dados do usuário ***
            const userDocRef = doc(db, usersCollectionPath, newUser.uid);
            await setDoc(userDocRef, {
                nome,
                email,
                matricula,
                role: 'servidor', // Default role for new users
                unidadeId: null, // Or a default unit if applicable
                createdAt: new Date(),
            });

            // The onAuthStateChanged listener will handle setting the user state
        } catch (error) {
            console.error("Firebase sign-up failed:", error);
            if (error.code === 'auth/email-already-in-use') {
                throw new Error("Este email já está em uso.");
            }
            throw new Error(error.message || "Falha ao criar a conta.");
        }
    }, [db, auth, usersCollectionPath]); // Removido isFirebaseInitialized

    const handleLogin = useCallback(async (matricula, password) => {
        if (!isFirebaseInitialized || !auth || !db) { // Adicionado verificação
            throw new Error('O login não está disponível no modo de demonstração ou Firebase não inicializado.');
        }

        try {
            const usersRef = collection(db, usersCollectionPath);
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
            // onAuthStateChanged irá atualizar o estado 'user'

        } catch(error) {
             console.error("Firebase login failed:", error);
             throw new Error("Matrícula ou senha incorretos.");
        }
    }, [db, auth, usersCollectionPath]); // Removido isFirebaseInitialized

    const handleForgotPassword = useCallback(async (email) => {
        if (!isFirebaseInitialized || !auth) { // Adicionado verificação
            throw new Error('A recuperação de senha não está disponível no modo de demonstração ou Firebase não inicializado.');
        }
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error) {
            console.error("Firebase password reset failed:", error);
            throw new Error("Falha ao enviar o email de recuperação. Verifique o endereço de email.");
        }
    }, [auth]); // Removido isFirebaseInitialized

    const handleLogout = useCallback(async () => {
        if (isFirebaseInitialized && auth) { // Adicionado verificação
            try { // Adicionado try/catch para signOut
                await signOut(auth);
            } catch (error) {
                console.error("Erro ao fazer logout:", error);
            }
        }
        setUser(null); // Garante que o usuário seja limpo mesmo se signOut falhar ou não for chamado
    }, [auth]); // Removido isFirebaseInitialized

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
        auth,
        // *** Adicionando todos os caminhos ao contexto para uso nos componentes filhos ***
        usersCollectionPath,
        unitsCollectionPath,
        solicitacoesCollectionPath,
        globalMessagesCollectionPath,
        publicDataPath // Pode ser útil ter o caminho base
    }), [user, isLoading, unidades, handleLogin, handleLogout, handleSignUp, handleForgotPassword, db, auth, usersCollectionPath, unitsCollectionPath, solicitacoesCollectionPath, globalMessagesCollectionPath, publicDataPath]);

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
// ... (ThemeToggleButton, LoadingScreen, GlobalMessageContainer, ConfirmationModal, FileViewerModal permanecem iguais) ...
// ... (LoginScreen, SignUpScreen, ForgotPasswordScreen permanecem iguais) ...
// ... (formatTime, formatDateOnly, formatDuration permanecem iguais) ...

const SolicitationModal = ({ isOpen, onClose }) => {
    // *** CORREÇÃO: Obter solicitacoesCollectionPath do contexto ***
    const { user, db, solicitacoesCollectionPath } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [formData, setFormData] = useState({
        tipo: 'abono',
        dataOcorrencia: new Date().toISOString().split('T')[0],
        justificativaTexto: '',
        anexoFile: null,
    });
    const [loading, setLoading] = useState(false);
    // *** CORREÇÃO: Remover definição local de solicitationCollectionPath ***
    // const solicitationCollectionPath = `/artifacts/${appId}/public/data/solicitacoes`;

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        setFormData(prev => ({ ...prev, [name]: files ? files[0] : value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isFirebaseInitialized || !db) { // Adicionado verificação
            setGlobalMessage({ type: 'warning', title: 'Modo Demo', message: 'Envio de solicitações desabilitado ou Firebase não inicializado.' });
            return;
        }
        setLoading(true);

        try {
            let anexoUrl = '';
            if (formData.anexoFile) {
                // *** NOTA: A lógica de upload de arquivos real precisaria ser implementada aqui usando Firebase Storage ***
                anexoUrl = `simulated://storage/${user.matricula}/${Date.now()}_${formData.anexoFile.name}`;
            }

            // *** CORREÇÃO: Usar a variável de caminho do contexto ***
            await addDoc(collection(db, solicitacoesCollectionPath), {
                requesterId: user.uid,
                requesterMatricula: user.matricula,
                requesterNome: user.nome,
                unidadeId: user.unidadeId,
                tipo: formData.tipo,
                dataOcorrencia: formData.dataOcorrencia, // Certifique-se que o formato está correto para o Firestore
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
            setFormData({ // Resetar formulário
                tipo: 'abono',
                dataOcorrencia: new Date().toISOString().split('T')[0],
                justificativaTexto: '',
                anexoFile: null,
            });
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro de Submissão', message: `Falha ao enviar: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // ... (JSX do modal permanece o mesmo) ...
    return (
       <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
            {/* ... JSX do modal ... */}
             <form onSubmit={handleSubmit} className="p-6 space-y-4">
                 {/* ... Inputs e Selects ... */}
             </form>
        </div>
    );
};


const ServidorDashboard = () => {
    // *** CORREÇÃO: Obter caminhos do contexto ***
    const { user, userId, db, handleLogout, unidades, usersCollectionPath, solicitacoesCollectionPath } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [points, setPoints] = useState([]);
    const [lastPoint, setLastPoint] = useState(null);
    const [clockInLoading, setClockInLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [solicitacoes, setSolicitacoes] = useState([]);

    // *** CORREÇÃO: Construir pointCollectionPath a partir do usersCollectionPath ***
    const pointCollectionPath = useMemo(() => userId ? `${usersCollectionPath}/${userId}/registros_ponto` : null, [usersCollectionPath, userId]);
    const unidadeNome = unidades[user?.unidadeId]?.name || 'Unidade não encontrada';

    useEffect(() => {
        // *** Adicionado verificação para pointCollectionPath ***
        if (!isFirebaseInitialized || !userId || !db || !pointCollectionPath) return;

        const qPoints = query(collection(db, pointCollectionPath), orderBy('timestamp', 'desc'));
        const unsubPoints = onSnapshot(qPoints, (snapshot) => {
            const fetchedPoints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPoints(fetchedPoints);
            setLastPoint(fetchedPoints[0] || null);
        }, (error) => console.error("Erro ao buscar registros de ponto:", error)); // Adicionado tratamento de erro

        const qSolicitations = query(collection(db, solicitacoesCollectionPath), where('requesterId', '==', userId), orderBy('createdAt', 'desc'));
        const unsubSolicitations = onSnapshot(qSolicitations, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Erro ao buscar solicitações:", error)); // Adicionado tratamento de erro

        return () => { unsubPoints(); unsubSolicitations(); };
    }, [db, userId, pointCollectionPath, solicitacoesCollectionPath]); // Removido isFirebaseInitialized

    // ... (dailySummary, isShiftFinishedToday, nextPointType permanecem iguais) ...

    const registerPoint = useCallback(async (type) => {
        // *** Adicionado verificação para pointCollectionPath ***
        if (!userId || !pointCollectionPath || nextPointType === 'finished' || !isFirebaseInitialized || !db) {
            setGlobalMessage({ type: 'warning', title: 'Aviso', message: 'Não é possível registrar ponto agora ou Firebase não inicializado.'});
            return;
        }
        setClockInLoading(true);

        try {
            // *** CORREÇÃO: Usar pointCollectionPath correto ***
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
    }, [userId, db, pointCollectionPath, user?.unidadeId, nextPointType, setGlobalMessage]); // Removido isFirebaseInitialized

    // ... (buttonMap e JSX do ServidorDashboard permanecem iguais) ...
    return (
      <div className="p-4 md:p-8">
         {/* ... JSX do dashboard ... */}
      </div>
    );
};

const GestorDashboard = () => {
    // *** CORREÇÃO: Obter solicitacoesCollectionPath do contexto ***
    const { user, db, handleLogout, unidades, solicitacoesCollectionPath } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [loadingAction, setLoadingAction] = useState(null);
    const [viewingFile, setViewingFile] = useState(null);

    // *** CORREÇÃO: Remover definição local de solicitacoesCollectionPath ***
    // const solicitacoesCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);
    const unidadeNome = unidades[user?.unidadeId]?.name || 'Unidade não encontrada';

    useEffect(() => {
        if (!isFirebaseInitialized || !user?.unidadeId || !db) return; // Adicionado verificação de db
        const q = query(
            collection(db, solicitacoesCollectionPath),
            where('unidadeId', '==', user.unidadeId),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Erro ao buscar solicitações:", error)); // Adicionado tratamento de erro
        return () => unsubscribe();
    }, [db, solicitacoesCollectionPath, user?.unidadeId]); // Removido isFirebaseInitialized

    const handleAction = useCallback(async (solicitationId, newStatus) => {
        if (!db) return; // Adicionado verificação
        setLoadingAction(solicitationId + newStatus);
        try {
            // *** CORREÇÃO: Usar solicitacoesCollectionPath do contexto ***
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

    // ... (getFileNameFromUrl e JSX do GestorDashboard permanecem iguais) ...
     return (
        <div className="p-4 md:p-8">
            {/* ... JSX do dashboard ... */}
        </div>
    );
};

const UserManagement = () => {
    // *** CORREÇÃO: Obter usersCollectionPath do contexto ***
    const { db, unidades, usersCollectionPath } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // *** CORREÇÃO: Remover a definição local de usersCollectionPath ***
    // const usersCollectionPath = `artifacts/${appId}/public/data/${USER_COLLECTION}`; // Já obtido do contexto

    useEffect(() => {
        if (!isFirebaseInitialized || !db) { // Adicionado verificação
            // ... (código do modo demo) ...
            setLoading(false); // Garantir que loading seja false no modo demo
            return;
        };
        const q = query(collection(db, usersCollectionPath)); // Usar caminho do contexto
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => { // Adicionado tratamento de erro
            console.error("Erro ao buscar usuários:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, usersCollectionPath]); // Removido isFirebaseInitialized

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUser || !isFirebaseInitialized || !db) return; // Adicionado verificação
        setIsSubmitting(true);
        try {
            const userDocRef = doc(db, usersCollectionPath, editingUser.id); // Usar caminho do contexto
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
        if (!userToDelete || !isFirebaseInitialized || !db) return; // Adicionado verificação
        setIsSubmitting(true);
        try {
            const userDocRef = doc(db, usersCollectionPath, userToDelete.id); // Usar caminho do contexto
            await deleteDoc(userDocRef);
            // *** IMPORTANTE: Aqui você também precisaria deletar o usuário do Firebase Authentication ***
            // Ex: const userToDeleteAuth = getUser(auth, userToDelete.id); // Precisa buscar o usuário no Auth
            // await deleteUser(userToDeleteAuth); // Função de admin SDK ou cloud function seria necessária para isso geralmente
            // A linha acima é apenas um exemplo, a exclusão do Auth é mais complexa do lado do cliente.
            // Por segurança, geralmente a exclusão completa é feita no backend ou com Cloud Functions.
            // Se você só deletar do Firestore, o usuário ainda poderá logar mas não terá dados.
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: `Usuário ${userToDelete.matricula} deletado do Firestore.` });
            setUserToDelete(null);
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao deletar o usuário do Firestore: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ... (handleEditingChange, filteredUsers, roleMap e JSX permanecem iguais) ...
    return (
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
          {/* ... JSX do componente ... */}
      </div>
    );
};

// ... (UnitManagementModal permanece igual) ...

const UnitManagement = () => {
    // *** CORREÇÃO: Obter unitsCollectionPath do contexto ***
    const { db, unitsCollectionPath } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unitToEdit, setUnitToEdit] = useState(null);
    const [unitToDelete, setUnitToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // *** CORREÇÃO: Remover definição local ***
    // const unitCollectionPath = `/artifacts/${appId}/public/data/${UNIT_COLLECTION}`;

    useEffect(() => {
        if (!isFirebaseInitialized || !db) { // Adicionado verificação
             // ... (código do modo demo) ...
             setLoading(false); // Garantir que loading seja false no modo demo
             return;
        }
        const q = query(collection(db, unitsCollectionPath), orderBy('name')); // Usar caminho do contexto
        const unsubscribe = onSnapshot(q, snapshot => {
            setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => { // Adicionado tratamento de erro
            console.error("Erro ao buscar unidades:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, unitsCollectionPath]); // Removido isFirebaseInitialized

    const handleSaveUnit = async (e) => {
        e.preventDefault();
        if (!unitToEdit?.name.trim() || !isFirebaseInitialized || !db) return; // Adicionado verificação
        setIsSubmitting(true);
        try {
            if (unitToEdit.id) {
                // *** CORREÇÃO: Usar caminho do contexto ***
                await updateDoc(doc(db, unitsCollectionPath, unitToEdit.id), { name: unitToEdit.name.trim() });
            } else {
                // *** CORREÇÃO: Usar caminho do contexto ***
                await addDoc(collection(db, unitsCollectionPath), { name: unitToEdit.name.trim() });
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
        if (!unitToDelete || !isFirebaseInitialized || !db) return; // Adicionado verificação
        setIsSubmitting(true);
        try {
            // *** CORREÇÃO: Usar caminho do contexto ***
            await deleteDoc(doc(db, unitsCollectionPath, unitToDelete.id));
            setGlobalMessage({ type: 'success', title: 'Sucesso', message: `Unidade "${unitToDelete.name}" removida.` });
            setUnitToDelete(null);
        } catch (error) {
            // *** IMPORTANTE: Considerar verificar se a unidade está sendo usada por algum usuário antes de excluir ***
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao remover a unidade: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };
    // ... (JSX do componente UnitManagement permanece igual) ...
    return (
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
         {/* ... JSX do componente ... */}
      </div>
    );
};

const MessageBoxForAllUsers = () => {
    // *** CORREÇÃO: Obter globalMessagesCollectionPath do contexto ***
    const { user: currentUser, db, globalMessagesCollectionPath } = useAuthContext();
    const { setMessage: setGlobalMessage } = useGlobalMessage();
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    // *** CORREÇÃO: Remover definição local ***
    // const messagesCollectionPath = `/artifacts/${appId}/public/data/global_messages`;

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim() || !isFirebaseInitialized || !db) return; // Adicionado verificação
        setLoading(true);
        try {
            // *** CORREÇÃO: Usar caminho do contexto ***
            await addDoc(collection(db, globalMessagesCollectionPath), {
                text: message,
                senderName: currentUser.nome,
                senderRole: currentUser.role,
                createdAt: new Date(),
            });
            setGlobalMessage({ type: 'success', title: 'Mensagem Enviada', message: 'Sua mensagem foi enviada para todos os usuários.' });
            setMessage('');
        } catch (error) {
            setGlobalMessage({ type: 'error', title: 'Erro', message: `Falha ao enviar mensagem: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };
    // ... (JSX do componente MessageBoxForAllUsers permanece igual) ...
    return (
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-800">
          {/* ... JSX do componente ... */}
      </div>
    );
};

// ... (RHAdminDashboard, Footer, AppContent, e a exportação default App permanecem iguais) ...

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
