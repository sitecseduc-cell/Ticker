import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDoc, updateDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { LogIn, LogOut, Clock, Calendar, User, Briefcase, RefreshCcw, Loader2, CheckCircle, AlertTriangle, XCircle, Pause, Mail, ArrowLeft, Users, FileText, Download, Edit, Trash2, X, File, Send, Aperture, BookOpen, Search, Plus, Minus, Home } from 'lucide-react';

// --- Variáveis Globais de Configuração do Ambiente ---
const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
};
const appId = 'secretaria-educacao-ponto';

// --- Configuração e Inicialização do Firebase ---
let app, auth, db;
try {
    // Verifica se as chaves essenciais existem antes de inicializar
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
}

// --- Dados de Demonstração (Simulação de Login por Matrícula) ---
const DUMMY_ACCOUNTS = {
    '10001': { email: 'rh@edu.br', password: '123', role: 'rh', nome: 'Admin RH', unidadeId: 'unidade-adm-01' },
    '20002': { email: 'gestor@edu.br', password: '123', role: 'gestor', nome: 'Diretor da Unidade', unidadeId: 'unidade-adm-01' },
    '30003': { email: 'servidor@edu.br', password: '123', role: 'servidor', nome: 'Ana Servidora', unidadeId: 'unidade-adm-01' },
    '40004': { email: 'estagiario@edu.br', password: '123', role: 'servidor', nome: 'Pedro Estagiário', unidadeId: 'unidade-adm-01' }
};
const ALL_ACCOUNTS = Object.values(DUMMY_ACCOUNTS);

// --- Definições de Estilos e Constantes ---
const TEXT_COLOR = '#1F2937';
const BG_COLOR = '#F9FAFB';
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

const UNIDADES = {
    'unidade-adm-01': { name: 'Controle e Movimentação' },
    'unidade-adm-02': { name: 'Núcleo de Logística' },
    'unidade-esc-01': { name: 'Escola Municipal A' },
};

function useFirebaseAuthentication() {
    const [user, setUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [role, setRole] = useState(null);

    const fetchUserProfile = useCallback(async (uid, email, roleOverride = null, matricula = null) => {
        const userDocRef = doc(db, 'artifacts', appId, USER_COLLECTION, uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            setUser({ ...auth.currentUser, ...userData });
            setRole(userData.role || 'servidor');
        } else {
            const defaultRole = roleOverride || 'servidor';
            const baseData = ALL_ACCOUNTS.find(acc => acc.email === email) || {};
            const finalData = {
                nome: baseData.nome || (email ? email.split('@')[0] : 'Servidor'),
                email: email,
                matricula: matricula || uid.substring(0, 8),
                role: defaultRole,
                unidadeId: baseData.unidadeId || 'unidade-adm-01'
            };
            await setDoc(userDocRef, finalData);
            setUser({ ...auth.currentUser, ...finalData });
            setRole(defaultRole);
        }
    }, []);

    useEffect(() => {
        if (!auth) {
            console.error("Firebase Auth não está inicializado.");
            setIsLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUserId(currentUser.uid);
                try {
                    await fetchUserProfile(currentUser.uid, currentUser.email || 'anon@ponto.br');
                } catch (e) {
                    console.error("Erro ao buscar/criar perfil do usuário:", e);
                    setUser(currentUser);
                }
            } else {
                setUser(null);
                setUserId(null);
                setRole(null);
            }
            setIsLoading(false);
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, [fetchUserProfile]);

    const handleLogout = useCallback(async () => {
        try {
            await signOut(auth);
            console.log("Logout realizado com sucesso.");
        } catch (error) {
            console.error("Erro durante o logout:", error);
        }
    }, []);

    return { user, userId, role, isAuthReady, isLoading, db, auth, fetchUserProfile, handleLogout };
}

const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className={`mt-4 text-lg font-medium text-[${TEXT_COLOR}]`}>Carregando sistema...</p>
    </div>
);

const CustomMessage = ({ type, title, message }) => {
    const iconMap = {
        success: <CheckCircle className="w-5 h-5 mr-2" />,
        error: <XCircle className="w-5 h-5 mr-2" />,
        warning: <AlertTriangle className="w-5 h-5 mr-2" />,
    };
    const colorMap = {
        success: 'bg-green-100 text-green-700 border-green-400',
        error: 'bg-red-100 text-red-700 border-red-400',
        warning: 'bg-yellow-100 text-yellow-700 border-yellow-400',
    };
    return (
        <div className={`p-4 rounded-lg border flex items-start ${colorMap[type]} transition-all duration-300`}>
            {iconMap[type]}
            <div>
                <p className="font-bold">{title}</p>
                <p className="text-sm">{message}</p>
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
    return date.toLocaleDateString('pt-BR', { dateStyle: 'short' });
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

const SolicitationModal = ({ user, db, isOpen, onClose, setMessage }) => {
    const [activeTab, setActiveTab] = useState('abono');
    const [formData, setFormData] = useState({
        dataOcorrencia: new Date().toISOString().split('T')[0],
        justificativaTexto: '',
        anexoFile: null,
    });
    const [loading, setLoading] = useState(false);
    const solicitationCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        if (name === 'anexoFile') {
            setFormData(prev => ({ ...prev, anexoFile: files[0] }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (!formData.justificativaTexto) {
            setMessage({ type: 'warning', title: 'Campo Obrigatório', message: 'A descrição da solicitação é obrigatória.' });
            setLoading(false);
            return;
        }

        try {
            let anexoUrl = '';
            if (formData.anexoFile) {
                anexoUrl = `simulated://storage/${user.matricula}/${formData.anexoFile.name}`;
            }

            const newSolicitation = {
                requesterId: user.uid,
                requesterMatricula: user.matricula,
                requesterNome: user.nome,
                unidadeId: user.unidadeId,
                tipo: activeTab,
                dataOcorrencia: formData.dataOcorrencia,
                justificativaTexto: formData.justificativaTexto,
                anexoUrl: anexoUrl,
                status: 'pendente',
                createdAt: new Date(),
            };

            await addDoc(collection(db, solicitationCollectionPath), newSolicitation);
            setMessage({
                type: 'success',
                title: 'Solicitação Enviada',
                message: `Sua solicitação de ${activeTab.toUpperCase()} foi enviada ao Gestor para análise.`
            });
            onClose();
            setFormData({ dataOcorrencia: new Date().toISOString().split('T')[0], justificativaTexto: '', anexoFile: null });
        } catch (error) {
            console.error("Erro ao enviar solicitação:", error);
            setMessage({ type: 'error', title: 'Erro de Submissão', message: `Falha ao enviar a solicitação: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className={`text-xl font-bold text-[${TEXT_COLOR}]`}>Nova Solicitação de Ponto</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                </div>
                <div className="flex border-b border-gray-200">
                    <button onClick={() => setActiveTab('abono')} className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${activeTab === 'abono' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Aperture className="w-4 h-4 inline mr-2" /> Abono (Ajuste de Registro)
                    </button>
                    <button onClick={() => setActiveTab('justificativa')} className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${activeTab === 'justificativa' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}>
                        <BookOpen className="w-4 h-4 inline mr-2" /> Justificativa (Ausência)
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Data de Ocorrência</label>
                        <input type="date" name="dataOcorrencia" value={formData.dataOcorrencia} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Descrição Detalhada</label>
                        <textarea name="justificativaTexto" value={formData.justificativaTexto} onChange={handleChange} rows="4" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"></textarea>
                    </div>
                    <div className="space-y-1 p-3 border border-dashed rounded-lg">
                        <label className="text-sm font-medium text-gray-700 block mb-2">Anexo (Opcional)</label>
                        <input type="file" name="anexoFile" onChange={handleChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        {formData.anexoFile && (
                            <p className="text-xs text-green-600 mt-2 flex items-center"><File className="w-4 h-4 mr-1" /> Arquivo selecionado: {formData.anexoFile.name}</p>
                        )}
                    </div>
                    <button type="submit" disabled={loading} className={`w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold transition duration-300 hover:bg-blue-600 ${loading ? 'bg-blue-400' : 'bg-blue-500'}`}>
                        {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                        {loading ? 'Enviando...' : 'Enviar Solicitação'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const ServidorDashboard = ({ user, userId, db, handleLogout }) => {
    const [lastPoint, setLastPoint] = useState(null);
    const [clockInLoading, setClockInLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [points, setPoints] = useState([]);
    const [solicitacoes, setSolicitacoes] = useState([]);

    const pointCollectionPath = useMemo(() => `/artifacts/${appId}/users/${userId}/registros_ponto`, [userId]);
    const solicitacoesCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);
    const unidade = UNIDADES[user?.unidadeId] || { name: 'N/A' };

    useEffect(() => {
        if (!db || !userId) return;
        const q = query(collection(db, pointCollectionPath), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPoints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPoints(fetchedPoints);
            setLastPoint(fetchedPoints[0] || null);
        }, (error) => console.error("Erro ao carregar registros:", error));
        return () => unsubscribe();
    }, [db, userId, pointCollectionPath]);

    useEffect(() => {
        if (!db || !userId) return;
        const q = query(collection(db, solicitacoesCollectionPath), where('requesterId', '==', userId), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Erro ao carregar solicitações:", error));
        return () => unsubscribe();
    }, [db, userId, solicitacoesCollectionPath]);

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
            let segmentStart = null;
            day.points.forEach(p => {
                const time = p.timestamp.toDate().getTime();
                if ((p.tipo === 'entrada' || p.tipo === 'volta') && segmentStart === null) {
                    segmentStart = time;
                } else if ((p.tipo === 'saida' || p.tipo === 'pausa') && segmentStart !== null) {
                    totalWorkedMs += time - segmentStart;
                    segmentStart = null;
                }
            });
            day.totalMs = totalWorkedMs;
            day.balanceMs = totalWorkedMs > 0 ? totalWorkedMs - TARGET_DAILY_HOURS_MS : 0;
        });

        totalBalanceMs = Object.values(summary).reduce((acc, day) => acc + day.balanceMs, 0);

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
        switch (lastPoint.tipo) {
            case 'entrada': return 'pausa';
            case 'pausa': return 'volta';
            case 'volta': return 'saida';
            case 'saida': return 'entrada';
            default: return 'entrada';
        }
    }, [lastPoint, isShiftFinishedToday]);

    const registerPoint = useCallback(async (type) => {
        if (!userId || type === 'finished') return;
        setClockInLoading(true);
        setMessage(null);
        try {
            const newPoint = {
                userId,
                timestamp: new Date(),
                tipo: type,
                unidadeId: user.unidadeId,
                dispositivo: navigator.userAgent,
                editado: false,
            };
            await addDoc(collection(db, pointCollectionPath), newPoint);
            setMessage({ type: 'success', title: 'Ponto Registrado!', message: `Sua ${type.toUpperCase()} foi registrada.` });
        } catch (error) {
            setMessage({ type: 'error', title: 'Erro no Sistema', message: `Falha ao salvar o ponto: ${error.message}` });
        } finally {
            setClockInLoading(false);
        }
    }, [userId, db, pointCollectionPath, user?.unidadeId]);
    
    const buttonMap = {
        entrada: { label: 'Entrada', icon: LogIn, color: 'bg-emerald-500 hover:bg-emerald-600' },
        pausa: { label: 'Início Pausa', icon: Pause, color: 'bg-amber-500 hover:bg-amber-600' },
        volta: { label: 'Fim Pausa', icon: RefreshCcw, color: 'bg-indigo-500 hover:bg-indigo-600' },
        saida: { label: 'Saída', icon: LogOut, color: 'bg-gray-500 hover:bg-gray-600' },
        finished: { label: 'Expediente Finalizado', icon: Clock, color: 'bg-gray-400' },
    };

    const currentButton = buttonMap[nextPointType];
    const isButtonDisabled = clockInLoading || nextPointType === 'finished';
    const roleMap = { 'servidor': 'Servidor/Estagiário', 'gestor': 'Gestor da Unidade', 'rh': 'RH/Administrador' };

    return (
        <div className={`p-4 sm:p-8 min-h-screen bg-[${BG_COLOR}]`}>
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className={`text-3xl font-bold text-[${TEXT_COLOR}]`}><Clock className="inline-block w-8 h-8 mr-2 text-blue-500" /> Ponto Eletrônico</h1>
                        <p className="text-gray-500 mt-1">Matrícula: <span className="font-semibold text-blue-600">{user.matricula}</span> | Perfil: {roleMap[user.role]}. Unidade: {unidade.name}</p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 transition duration-150 p-2 rounded-lg hover:bg-red-50">
                        <LogOut className="w-4 h-4 mr-1" /> Sair
                    </button>
                </header>

                <section className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-blue-100 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Saldo Acumulado (Banco de Horas)</p>
                        <p className={`text-4xl font-extrabold mt-1 ${dailySummary.totalBalanceMs >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatDuration(dailySummary.totalBalanceMs)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500">Jornada Padrão</p>
                        <p className="text-xl font-bold text-blue-600">8h / dia</p>
                    </div>
                </section>

                <section className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-blue-100">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}]`}>Registrar Ponto</h2>
                    {message && <div className="mb-4"><CustomMessage {...message} /></div>}
                    <div className="flex flex-col sm:flex-row items-center justify-between">
                        <div className="flex-1 text-center sm:text-left">
                            <p className="text-sm text-gray-500">{nextPointType === 'finished' ? 'Estado Atual:' : 'Próximo Ponto a Bater:'}</p>
                            <p className={`text-4xl font-extrabold mt-1 ${nextPointType === 'finished' ? 'text-gray-500' : 'text-blue-600'}`}>{currentButton.label.toUpperCase()}</p>
                            <p className="text-sm text-gray-500 mt-1">Último registro: {lastPoint ? `${lastPoint.tipo.toUpperCase()} às ${formatTime(lastPoint.timestamp)}` : 'Nenhum'}</p>
                        </div>
                        <button onClick={() => registerPoint(nextPointType)} disabled={isButtonDisabled} className={`flex items-center justify-center w-full sm:w-auto px-8 py-3 rounded-full text-white font-semibold transition duration-300 ease-in-out transform shadow-md ${currentButton.color} ${!isButtonDisabled && 'hover:scale-105'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                            {clockInLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <currentButton.icon className="w-5 h-5 mr-2" />}
                            {clockInLoading ? 'Processando...' : currentButton.label}
                        </button>
                    </div>
                </section>

                <section className="bg-white p-6 rounded-xl shadow-lg mb-8">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}><Aperture className="w-5 h-5 mr-2 text-blue-500" /> Minhas Solicitações</h2>
                    <div className="flex justify-end mb-4">
                        <button onClick={() => setIsModalOpen(true)} className="flex items-center text-sm font-medium bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-150 shadow-md">
                            <Send className="w-4 h-4 mr-1" /> Nova Solicitação
                        </button>
                    </div>
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo / Data</th><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th></tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {solicitacoes.length > 0 ? solicitacoes.slice(0, 5).map(sol => (
                                    <tr key={sol.id} className="hover:bg-blue-50">
                                        <td className="px-3 py-3"><span className={`text-xs font-bold block`}>{sol.tipo.toUpperCase()}</span><span className="text-xs text-gray-500">Em: {sol.dataOcorrencia}</span></td>
                                        <td className="px-3 py-3 text-sm max-w-xs truncate">{sol.justificativaTexto}</td>
                                        <td className="px-3 py-3"><span className={`px-2 inline-flex text-xs font-semibold rounded-full ${STATUS_COLORS[sol.status]}`}>{sol.status.toUpperCase()}</span></td>
                                    </tr>
                                )) : <tr><td colSpan="3" className="px-3 py-4 text-center text-gray-500 italic">Nenhuma solicitação encontrada.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="bg-white p-6 rounded-xl shadow-lg">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}><Calendar className="w-5 h-5 mr-2 text-blue-500" /> Espelho de Ponto</h2>
                     <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registros</th><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horas Dia</th><th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo Dia</th></tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {Object.keys(dailySummary.summary).length > 0 ? Object.entries(dailySummary.summary).reverse().slice(0, 10).map(([date, data]) => (
                                    <tr key={date} className="hover:bg-blue-50">
                                        <td className="px-3 py-3"><span className="text-sm font-medium">{date}</span></td>
                                        <td className="px-3 py-3 text-sm">{data.points.map(p => (<span key={p.id} className={`block text-xs ${STATUS_COLORS[p.tipo]}`}>{`${p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)}: ${formatTime(p.timestamp)}`}</span>))}</td>
                                        <td className="px-3 py-3"><span className="font-bold">{formatDuration(data.totalMs)}</span></td>
                                        <td className="px-3 py-3"><span className={`text-sm font-semibold ${data.balanceMs >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatDuration(data.balanceMs)}</span></td>
                                    </tr>
                                )) : <tr><td colSpan="4" className="px-3 py-4 text-center text-gray-500 italic">Nenhum registro encontrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
                
                <SolicitationModal user={user} db={db} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} setMessage={setMessage} />
                <footer className="mt-8 text-center text-xs text-gray-400">
                    <p>ID da Sessão: {userId}</p>
                    <p>Desenvolvido para a Secretaria de Educação - Ponto Eletrônico</p>
                </footer>
            </div>
        </div>
    );
};

// ... (Restante dos componentes: UserManagement, UnitManagement, RHAdminDashboard, GestorDashboard, etc.)
// ... (Componentes de Autenticação: PasswordRecoveryScreen, RegistrationScreen, LoginScreen)

const UserManagement = ({ db, appId }) => {
    // ... (código do componente)
};
const UnitManagement = ({ db, appId }) => {
    // ... (código do componente)
};
const RHAdminDashboard = ({ user, handleLogout, db, appId }) => {
    // ... (código do componente)
};
const GestorDashboard = ({ user, handleLogout, db }) => {
    // ... (código do componente)
};
const PasswordRecoveryScreen = ({ setCurrentView }) => {
    // ... (código do componente)
};
const RegistrationScreen = ({ setCurrentView, auth, fetchUserProfile, db, appId }) => {
    // ... (código do componente)
};
const LoginScreen = ({ setCurrentView, auth, fetchUserProfile }) => {
    // ... (código do componente)
};

export default function App() {
    const { user, userId, role, isAuthReady, isLoading, db, auth, fetchUserProfile, handleLogout } = useFirebaseAuthentication();
    const [currentAuthView, setCurrentView] = useState('login');

    if (isLoading || !isAuthReady) {
        return <LoadingScreen />;
    }

    if (!user || !db || !userId) {
        return (
            <div className={`flex flex-col items-center justify-center min-h-screen bg-[${BG_COLOR}] p-4`}>
                {currentAuthView === 'login' && <LoginScreen setCurrentView={setCurrentView} auth={auth} fetchUserProfile={fetchUserProfile} />}
                {currentAuthView === 'register' && <RegistrationScreen setCurrentView={setCurrentView} auth={auth} fetchUserProfile={fetchUserProfile} db={db} appId={appId} />}
                {currentAuthView === 'recover' && <PasswordRecoveryScreen setCurrentView={setCurrentView} />}
            </div>
        );
    }

    switch (role) {
        case 'servidor': return <ServidorDashboard user={user} userId={userId} db={db} handleLogout={handleLogout} />;
        case 'gestor': return <GestorDashboard user={user} handleLogout={handleLogout} db={db} />;
        case 'rh': return <RHAdminDashboard user={user} handleLogout={handleLogout} db={db} appId={appId} />;
        default:
            return (
                <div className={`p-8 min-h-screen bg-[${BG_COLOR}]`}>
                    <div className="max-w-4xl mx-auto text-center bg-white p-8 rounded-xl shadow-lg">
                        <h1 className="text-3xl font-bold text-red-500 mb-4">Perfil Desconhecido</h1>
                        <p className="text-lg text-gray-600">Entre em contato com o suporte.</p>
                        <button onClick={handleLogout} className="mt-6 flex items-center mx-auto text-sm font-medium text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"><LogOut className="w-4 h-4 mr-1" /> Sair</button>
                    </div>
                </div>
            );
    }
}
