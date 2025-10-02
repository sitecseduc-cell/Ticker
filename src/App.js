import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import {
    getFirestore, doc, setDoc, collection, query, where, orderBy, onSnapshot,
    addDoc, getDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
    LogIn, LogOut, Clock, User, Briefcase, RefreshCcw, Loader2, CheckCircle,
    AlertTriangle, XCircle, Pause, Mail, Users, FileText, Edit,
    Trash2, X, File, Send, Search, Plus, Home, MessageSquare
} from 'lucide-react';

// --- Configuração do Ambiente Firebase ---
// Estas variáveis são injetadas pelo ambiente de execução.
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
        console.warn("Configuração do Firebase não encontrada. Usando modo de demonstração sem persistência real.");
        app = {}; auth = {}; db = null;
    }
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
    app = {}; auth = {}; db = null;
}

// --- Dados de Demonstração (Simulação de Login por Matrícula) ---
const DUMMY_ACCOUNTS = {
    '10001': { email: 'rh@edu.br', password: '123', role: 'rh', nome: 'Admin RH', unidadeId: 'unidade-adm-01' },
    '20002': { email: 'gestor@edu.br', password: '123', role: 'gestor', nome: 'Diretor da Unidade', unidadeId: 'unidade-adm-01' },
    '30003': { email: 'servidor@edu.br', password: '123', role: 'servidor', nome: 'Ana Servidora', unidadeId: 'unidade-adm-01' },
    '40004': { email: 'estagiario@edu.br', password: '123', role: 'servidor', nome: 'Pedro Estagiário', unidadeId: 'unidade-adm-01' }
};

// --- Definições de Estilos e Constantes ---
const STATUS_COLORS = {
    entrada: 'text-emerald-600 bg-emerald-100',
    saida: 'text-gray-600 bg-gray-100',
    pausa: 'text-amber-600 bg-amber-100',
    volta: 'text-indigo-600 bg-indigo-100',
    finished: 'text-gray-500 bg-gray-200',
    pendente: 'text-amber-600 bg-amber-100',
    aprovado: 'text-green-600 bg-green-100',
    reprovado: 'text-red-600 bg-red-100',
};
const TARGET_DAILY_HOURS_MS = 8 * 60 * 60 * 1000;
const USER_COLLECTION = 'users';
const UNIT_COLLECTION = 'unidades';

// Hook de autenticação
function useFirebaseAuthentication() {
    const [user, setUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [role, setRole] = useState(null);
    const [unidades, setUnidades] = useState({});

    useEffect(() => {
      if (!isFirebaseInitialized) {
          setUnidades({
              'unidade-adm-01': { name: 'Controle e Movimentação (Demo)' },
              'unidade-esc-01': { name: 'Escola Municipal A (Demo)' },
          });
          return;
      };
      const q = query(collection(db, `/artifacts/${appId}/public/data/${UNIT_COLLECTION}`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const units = {};
          snapshot.forEach(doc => units[doc.id] = doc.data());
          setUnidades(units);
      });
      return () => unsubscribe();
    }, []);

    const fetchUserProfile = useCallback(async (uid, email, roleOverride = null, matricula = null) => {
        if (!isFirebaseInitialized) {
            const dummyUser = DUMMY_ACCOUNTS[matricula] || { nome: 'Usuário Demo', email, matricula, role: roleOverride || 'servidor', unidadeId: 'unidade-adm-01' };
            setUser({ uid, ...dummyUser });
            setRole(dummyUser.role);
            return;
        }

        const userDocRef = doc(db, 'artifacts', appId, USER_COLLECTION, uid);
        let userSnap = await getDoc(userDocRef);

        if (!userSnap.exists()) {
            const defaultRole = roleOverride || 'servidor';
            const baseData = Object.values(DUMMY_ACCOUNTS).find(acc => acc.email === email) || {};
            const finalData = {
                nome: baseData.nome || (email ? email.split('@')[0] : 'Novo Usuário'),
                email: email,
                matricula: matricula || uid.substring(0, 8),
                role: defaultRole,
                unidadeId: baseData.unidadeId || Object.keys(unidades)[0] || 'unidade-adm-01'
            };
            await setDoc(userDocRef, finalData);
            setUser({ uid, ...finalData });
            setRole(finalData.role);
        } else {
            const userData = userSnap.data();
            setUser({ uid, ...userData });
            setRole(userData.role);
        }
    }, [unidades]);

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setIsLoading(false);
            setIsAuthReady(true);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUserId(currentUser.uid);
                await fetchUserProfile(currentUser.uid, currentUser.email || 'anon@ponto.br');
            } else {
                setUser(null); setUserId(null); setRole(null);
            }
            setIsLoading(false);
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, [fetchUserProfile]);

    const handleLogout = useCallback(async () => {
        if (isFirebaseInitialized) {
            await signOut(auth);
        } else {
            setUser(null); // Para modo demo
        }
    }, []);

    return { user, userId, role, isAuthReady, isLoading, db, auth, fetchUserProfile, handleLogout, unidades };
}

// --- Componentes de UI reutilizáveis ---
const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="mt-4 text-lg font-medium text-gray-700">Carregando sistema...</p>
    </div>
);

const GlobalMessageContainer = ({ message, setMessage }) => {
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
            <div className="bg-white rounded-xl shadow-lg border p-4 flex items-start space-x-3">
                {iconMap[message.type]}
                <div className="flex-1">
                    <p className="font-bold text-gray-800">{message.title}</p>
                    <p className="text-sm text-gray-600">{message.message}</p>
                </div>
                <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, isLoading }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-gray-800 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" /> {title}
                </h3>
                <p className="text-gray-600 mt-2">{message}</p>
                <div className="flex justify-end space-x-3 mt-6">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition">Cancelar</button>
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
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800">Visualizar Anexo</h3>
                <p className="text-sm text-gray-500 mt-1">Nome do arquivo: {fileName}</p>
                <div className="mt-4 p-4 border rounded-lg text-center bg-gray-50">
                    <p className="font-semibold">Visualização de anexo simulada.</p>
                    <p className="text-sm text-gray-600">Em um ambiente de produção, o arquivo seria exibido aqui.</p>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-blue-600 hover:underline text-xs break-all">
                        URL simulada: {fileUrl}
                    </a>
                </div>
                <button onClick={onClose} className="mt-6 w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Fechar</button>
            </div>
        </div>
    );
};

// --- Funções de Formatação ---
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

// --- Componente unificado para Solicitações ---
const SolicitationModal = ({ user, db, isOpen, onClose, setGlobalMessage }) => {
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
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800">Nova Solicitação de Ponto</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Tipo de Solicitação</label>
                        <select name="tipo" value={formData.tipo} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg">
                            <option value="abono">Abono (Ajuste de Registro)</option>
                            <option value="justificativa">Justificativa (Ausência)</option>
                        </select>
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Data de Ocorrência</label>
                        <input type="date" name="dataOcorrencia" value={formData.dataOcorrencia} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg"/>
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Descrição Detalhada</label>
                        <textarea name="justificativaTexto" value={formData.justificativaTexto} onChange={handleChange} rows="4" required className="w-full px-3 py-2 border rounded-lg"></textarea>
                    </div>
                    <div className="space-y-1 p-3 border border-dashed rounded-lg">
                        <label className="text-sm font-medium text-gray-700 block mb-2">Anexo (Opcional)</label>
                        <input type="file" name="anexoFile" onChange={handleChange} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                        {formData.anexoFile && <p className="text-xs text-green-600 mt-2 flex items-center"><File className="w-4 h-4 mr-1"/>{formData.anexoFile.name}</p>}
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

// --- DASHBOARDS ---
const ServidorDashboard = ({ user, userId, db, handleLogout, setGlobalMessage, unidades }) => {
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
        <div className="p-4 sm:p-8 min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">
                            <Clock className="inline-block w-8 h-8 mr-2 text-blue-500" />
                             Ponto Eletrônico
                        </h1>
                        <p className="text-gray-500 mt-1">
                             Bem-vindo(a), <span className="font-semibold text-blue-600">{user.nome}</span>.
                        </p>
                        <p className="text-sm text-gray-500">
                            Matrícula: {user.matricula} | Unidade: {unidadeNome}
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 transition duration-150 p-2 rounded-lg hover:bg-red-50"
                    >
                        <LogOut className="w-4 h-4 mr-1" />
                        Sair
                    </button>
                </header>

                <section className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-blue-100 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Saldo Acumulado (Banco de Horas)</p>
                        <p className={`text-4xl font-extrabold mt-1 ${dailySummary.totalBalanceMs >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatDuration(dailySummary.totalBalanceMs)}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500">Jornada Padrão</p>
                        <p className="text-xl font-bold text-blue-600">8h / dia</p>
                    </div>
                </section>

                <section className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-blue-100">
                   <h2 className="text-xl font-semibold mb-4 text-gray-800">Registrar Ponto</h2>
                   <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
                        <div className="flex-1 text-center sm:text-left">
                           <p className="text-sm text-gray-500">Próximo Ponto:</p>
                           <p className={`text-4xl font-extrabold mt-1 ${nextPointType === 'finished' ? 'text-gray-500' : 'text-blue-600'}`}>{currentButton.label.toUpperCase()}</p>
                           <p className="text-sm text-gray-500 mt-1">Último: {lastPoint ? `${lastPoint.tipo.toUpperCase()} às ${formatTime(lastPoint.timestamp)}` : 'Nenhum'}</p>
                        </div>
                        <button onClick={() => registerPoint(nextPointType)} disabled={clockInLoading || nextPointType === 'finished'} className={`flex items-center justify-center w-full sm:w-auto px-8 py-3 rounded-full text-white font-semibold transition shadow-md ${currentButton.color} disabled:opacity-50 disabled:cursor-not-allowed`}>
                            {clockInLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <currentButton.icon className="w-5 h-5 mr-2" />}
                            {clockInLoading ? 'Processando...' : currentButton.label}
                        </button>
                    </div>
                </section>

                <section className="bg-white p-6 rounded-xl shadow-lg mb-8">
                   <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">Minhas Solicitações</h2>
                   <div className="flex justify-end mb-4">
                        <button onClick={() => setIsModalOpen(true)} className="flex items-center text-sm font-medium bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 shadow-md">
                            <Send className="w-4 h-4 mr-1" /> Nova Solicitação
                        </button>
                   </div>
                   <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo/Data</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {solicitacoes.slice(0, 5).map(sol => (
                                    <tr key={sol.id}>
                                        <td className="px-3 py-3">
                                            <span className="text-sm font-bold block">{sol.tipo === 'abono' ? 'Abono' : 'Justificativa'}</span>
                                            <span className="text-xs text-gray-500">{sol.dataOcorrencia}</span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status}</span>
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && <tr><td colSpan="2" className="py-4 text-center text-gray-500">Nenhuma solicitação.</td></tr>}
                            </tbody>
                        </table>
                   </div>
                </section>

                 <SolicitationModal user={user} db={db} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} setGlobalMessage={setGlobalMessage} />
            </div>
        </div>
    );
};

const GestorDashboard = ({ user, handleLogout, db, setGlobalMessage, unidades }) => {
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
        <div className="p-4 sm:p-8 min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">
                            <User className="inline-block w-8 h-8 mr-2 text-blue-500" /> Painel do Gestor
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600">{user.nome}</span>. Unidade: {unidadeNome}.
                        </p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50">
                        <LogOut className="w-4 h-4 mr-1" /> Sair
                    </button>
                </header>

                <section className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
                    <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                        <Mail className="w-5 h-5 mr-2 text-amber-500" />
                        Caixa de Solicitações ({solicitacoes.filter(s => s.status === 'pendente').length} pendentes)
                    </h2>

                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Servidor</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo/Data</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Justificativa</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status/Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {solicitacoes.map(sol => (
                                    <tr key={sol.id}>
                                        <td className="px-3 py-3"><span className="text-sm font-medium">{sol.requesterNome}</span></td>
                                        <td className="px-3 py-3">
                                            <span className="font-bold text-xs block">{sol.tipo.toUpperCase()}</span>
                                            <span className="text-xs text-gray-500">{sol.dataOcorrencia}</span>
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-600 max-w-xs truncate" title={sol.justificativaTexto}>
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
                                {solicitacoes.length === 0 && <tr><td colSpan="4" className="py-4 text-center text-gray-500">Nenhuma solicitação.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

                <FileViewerModal isOpen={!!viewingFile} onClose={() => setViewingFile(null)} fileUrl={viewingFile?.url} fileName={viewingFile?.name} />
            </div>
        </div>
    );
};

const RHAdminDashboard = ({ user, handleLogout, db, setGlobalMessage, unidades }) => {
    const [activeTab, setActiveTab] = useState('users');
    const roleMap = { 'servidor': 'Servidor', 'gestor': 'Gestor', 'rh': 'RH/Admin' };

    return (
        <div className="p-4 sm:p-8 min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto">
                 <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800"><Briefcase className="inline w-8 h-8 mr-2 text-blue-500" /> Painel de Administração (RH)</h1>
                        <p className="text-gray-500 mt-1">Bem-vindo(a), <span className="font-semibold text-blue-600">{user.nome}</span>. Perfil: {roleMap[user.role]}.</p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-500 p-2 rounded-lg hover:bg-red-50"><LogOut className="w-4 h-4 mr-1" /> Sair</button>
                </header>

                <div className="flex border-b mb-6">
                    <button onClick={() => setActiveTab('users')} className={`flex items-center py-3 px-6 text-sm font-medium ${activeTab === 'users' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}><Users className="w-4 h-4 mr-2" /> Gestão de Usuários</button>
                    <button onClick={() => setActiveTab('units')} className={`flex items-center py-3 px-6 text-sm font-medium ${activeTab === 'units' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}><Home className="w-4 h-4 mr-2" /> Gestão de Unidades</button>
                    <button onClick={() => setActiveTab('messages')} className={`flex items-center py-3 px-6 text-sm font-medium ${activeTab === 'messages' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}><MessageSquare className="w-4 h-4 mr-2" /> Caixa de Mensagens</button>
                </div>

                {activeTab === 'users' && <UserManagement db={db} appId={appId} setGlobalMessage={setGlobalMessage} unidades={unidades} />}
                {activeTab === 'units' && <UnitManagement db={db} appId={appId} setGlobalMessage={setGlobalMessage} />}
                {activeTab === 'messages' && <MessageBoxForAllUsers db={db} appId={appId} currentUser={user} setGlobalMessage={setGlobalMessage} />}
            </div>
        </div>
    );
};


// --- Componentes CRUD ---
const UserManagement = ({ db, appId, setGlobalMessage, unidades }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const usersCollectionPath = `/artifacts/${appId}/${USER_COLLECTION}`;

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setUsers(Object.entries(DUMMY_ACCOUNTS).map(([id, data]) => ({ id, ...data, matricula: id })));
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
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-500" /> Gestão de Usuários
            </h3>

            <div className="relative w-full mb-4">
                <input
                    type="text"
                    placeholder="Buscar por nome ou matrícula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg pl-10"
                />
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            </div>

             {loading ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>
            ) : (
                <div className="overflow-x-auto">
                     <table className="min-w-full divide-y divide-gray-200">
                         <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matrícula/Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Perfil</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidade</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                            {filteredUsers.map(user => (
                                <tr key={user.id}>
                                    <td className="px-4 py-3">
                                        <span className="text-sm font-medium block">{user.nome}</span>
                                        <span className="text-xs text-gray-500">Matrícula: {user.matricula}</span>
                                    </td>
                                    <td className="px-4 py-3"><span className="text-sm">{roleMap[user.role] || user.role}</span></td>
                                    <td className="px-4 py-3 text-sm">{unidades[user.unidadeId]?.name || 'N/A'}</td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button onClick={() => setEditingUser({...user})} className="text-blue-600 hover:text-blue-800 p-1"><Edit className="w-4 h-4" /></button>
                                        <button onClick={() => setUserToDelete(user)} className="text-red-600 hover:text-red-800 p-1"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingUser && (
                 <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
                     <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                         <div className="p-6 border-b">
                             <h3 className="text-xl font-bold text-gray-800">Editar Usuário</h3>
                         </div>
                         <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                             <div>
                                 <label className="text-sm font-medium">Nome</label>
                                 <input type="text" name="nome" value={editingUser.nome} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1" />
                             </div>
                             <div>
                                 <label className="text-sm font-medium">Matrícula</label>
                                 <input type="text" name="matricula" value={editingUser.matricula} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1" />
                             </div>
                             <div>
                                 <label className="text-sm font-medium">Perfil</label>
                                 <select name="role" value={editingUser.role} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1">
                                     <option value="servidor">Servidor</option>
                                     <option value="gestor">Gestor</option>
                                     <option value="rh">RH/Admin</option>
                                 </select>
                             </div>
                             <div>
                                 <label className="text-sm font-medium">Unidade</label>
                                 <select name="unidadeId" value={editingUser.unidadeId} onChange={handleEditingChange} className="w-full p-2 border rounded-lg mt-1">
                                     {Object.entries(unidades).map(([id, unit]) => (
                                         <option key={id} value={id}>{unit.name}</option>
                                     ))}
                                 </select>
                             </div>
                             <div className="flex justify-end space-x-3 pt-4">
                                 <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 rounded-lg">Cancelar</button>
                                 <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center disabled:bg-blue-300">
                                     {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}
                                     Salvar
                                 </button>
                             </div>
                         </form>
                     </div>
                 </div>
            )}

            <ConfirmationModal
                isOpen={!!userToDelete}
                title="Confirmar Exclusão"
                message={`Deseja realmente excluir o usuário ${userToDelete?.nome}? Esta ação é irreversível.`}
                onConfirm={handleDeleteUser}
                onCancel={() => setUserToDelete(null)}
                isLoading={isSubmitting}
            />
        </div>
    );
};

const UnitManagementModal = ({ isOpen, onClose, onSave, unit, setUnit, isLoading }) => {
    if (!isOpen) return null;

    const handleChange = (e) => {
        setUnit({ ...unit, [e.target.name]: e.target.value });
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                 <div className="p-6 border-b">
                     <h3 className="text-xl font-bold text-gray-800">{unit.id ? 'Editar Unidade' : 'Adicionar Unidade'}</h3>
                 </div>
                 <form onSubmit={onSave} className="p-6 space-y-4">
                     <div>
                         <label className="text-sm font-medium">Nome da Unidade</label>
                         <input
                            type="text"
                            name="name"
                            value={unit.name}
                            onChange={handleChange}
                            className="w-full p-2 border rounded-lg mt-1"
                            required
                         />
                     </div>
                     <div className="flex justify-end space-x-3 pt-4">
                         <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancelar</button>
                         <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center disabled:bg-blue-300">
                             {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}
                             Salvar
                         </button>
                     </div>
                 </form>
            </div>
        </div>
    );
}

const UnitManagement = ({ db, appId, setGlobalMessage }) => {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unitToEdit, setUnitToEdit] = useState(null);
    const [unitToDelete, setUnitToDelete] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const unitCollectionPath = `/artifacts/${appId}/public/data/${UNIT_COLLECTION}`;

    useEffect(() => {
        if (!isFirebaseInitialized) {
            setUnits(Object.entries({
                'unidade-adm-01': { name: 'Controle e Movimentação' },
                'unidade-adm-02': { name: 'Núcleo de Logística' },
                'unidade-esc-01': { name: 'Escola Municipal A' },
            }).map(([id, data]) => ({id, ...data})))
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
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold flex items-center"><Home className="w-5 h-5 mr-2 text-blue-500" /> Gestão de Unidades</h3>
                <button onClick={() => setUnitToEdit({ name: '' })} className="flex items-center text-sm font-medium bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"><Plus className="w-5 h-5 mr-1" /> Adicionar Unidade</button>
             </div>
             <div className="overflow-x-auto">
                 <table className="min-w-full divide-y divide-gray-200">
                     <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome da Unidade</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                     <tbody className="bg-white divide-y divide-gray-200">
                        {units.map(unit => (
                            <tr key={unit.id}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{unit.name}</td>
                                <td className="px-4 py-3 text-right space-x-2">
                                    <button onClick={() => setUnitToEdit(unit)} className="text-blue-600 hover:text-blue-800 p-1"><Edit className="w-4 h-4" /></button>
                                    <button onClick={() => setUnitToDelete(unit)} className="text-red-600 hover:text-red-800 p-1"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <UnitManagementModal
                isOpen={!!unitToEdit}
                onClose={() => setUnitToEdit(null)}
                onSave={handleSaveUnit}
                unit={unitToEdit}
                setUnit={setUnitToEdit}
                isLoading={isSubmitting}
            />

            <ConfirmationModal
                isOpen={!!unitToDelete}
                title="Confirmar Exclusão"
                message={`Deseja realmente excluir a unidade "${unitToDelete?.name}"?`}
                onConfirm={handleDeleteUnit}
                onCancel={() => setUnitToDelete(null)}
                isLoading={isSubmitting}
            />
        </div>
    );
};

const MessageBoxForAllUsers = ({ db, appId, currentUser, setGlobalMessage }) => {
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
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center"><MessageSquare className="w-5 h-5 mr-2 text-blue-500"/> Enviar Mensagem Global</h3>
            <p className="text-sm text-gray-500 mb-4">Envie uma notificação que aparecerá para todos os usuários ao entrarem no sistema.</p>
            <form onSubmit={handleSendMessage} className="space-y-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem aqui..." rows="4" required className="w-full p-2 border rounded-lg"></textarea>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-2 px-4 rounded-lg text-white font-semibold bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400">
                     {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                     {loading ? 'Enviando...' : 'Enviar Mensagem'}
                </button>
            </form>
        </div>
    );
};

// --- Componente de Autenticação ---
const LoginScreen = ({ setCurrentView, auth, fetchUserProfile, setGlobalMessage }) => {
    const [matricula, setMatricula] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        const account = DUMMY_ACCOUNTS[matricula];
        if (!account || account.password !== password) {
            setGlobalMessage({ type: 'error', title: 'Falha no Login', message: 'Matrícula ou senha incorretos.' });
            setLoading(false);
            return;
        }

        if (!isFirebaseInitialized) { // Modo demonstração sem Firebase
            await fetchUserProfile(matricula, account.email, account.role, matricula);
        } else { // Modo com Firebase
            try {
                // Simula um login persistente criando um usuário anônimo e atrelando os dados
                const userCredential = await signInAnonymously(auth);
                await fetchUserProfile(userCredential.user.uid, account.email, account.role, matricula);
            } catch (e) {
                setGlobalMessage({ type: 'error', title: 'Erro de Autenticação', message: e.message });
            }
        }
        setLoading(false);
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold text-center mb-6">Acesso ao Ponto</h2>
            <form onSubmit={handleLogin} className="space-y-4">
                 <input type="text" placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} required className="w-full p-3 border rounded-lg" />
                 <input type="password" placeholder="Senha (padrão: 123)" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg" />
                 <button type="submit" disabled={loading} className="w-full py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-blue-400">Entrar</button>
            </form>
             <div className="mt-4 text-center text-sm">
                <button onClick={() => setCurrentView('recover')} className="text-gray-500 hover:text-blue-600">Esqueceu a Senha?</button>
            </div>
             <div className="mt-6 pt-4 border-t">
                <h3 className="text-sm font-semibold mb-2">Contas de Demonstração (Senha: 123)</h3>
                <ul className="text-xs space-y-1">
                    <li><span className="font-semibold">RH/Admin:</span> 10001</li>
                    <li><span className="font-semibold">Gestor:</span> 20002</li>
                    <li><span className="font-semibold">Servidor:</span> 30003</li>
                </ul>
            </div>
        </div>
    );
};

// --- Componente Principal da Aplicação ---
export default function App() {
    const { user, role, isAuthReady, isLoading, auth, fetchUserProfile, handleLogout, unidades } = useFirebaseAuthentication();
    const [currentAuthView, setCurrentView] = useState('login');
    const [globalMessage, setGlobalMessage] = useState(null);

    if (isLoading || !isAuthReady) {
        return <LoadingScreen />;
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
                <GlobalMessageContainer message={globalMessage} setMessage={setGlobalMessage} />
                {currentAuthView === 'login' && <LoginScreen
                    setCurrentView={setCurrentView}
                    auth={auth}
                    fetchUserProfile={fetchUserProfile}
                    setGlobalMessage={setGlobalMessage}
                />}
                {/* Outras telas de autenticação podem ser adicionadas aqui */}
            </div>
        );
    }

    return (
        <>
            <GlobalMessageContainer message={globalMessage} setMessage={setGlobalMessage} />
            {role === 'servidor' && <ServidorDashboard user={user} userId={user.uid} db={db} handleLogout={handleLogout} setGlobalMessage={setGlobalMessage} unidades={unidades} />}
            {role === 'gestor' && <GestorDashboard user={user} handleLogout={handleLogout} db={db} setGlobalMessage={setGlobalMessage} unidades={unidades} />}
            {role === 'rh' && <RHAdminDashboard user={user} handleLogout={handleLogout} db={db} setGlobalMessage={setGlobalMessage} unidades={unidades} />}
        </>
    );
}
