import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDoc, updateDoc, getDocs, deleteDoc } from 'firebase/firestore';
// Nota: Para anexos reais, o Firebase Storage (import 'firebase/storage') seria necessário.
import { LogIn, LogOut, Clock, Calendar, User, Briefcase, RefreshCcw, Loader2, CheckCircle, AlertTriangle, XCircle, Pause, Zap, Mail, ArrowLeft, Users, FileText, Download, Edit, Trash2, X, File, Send, Aperture, BookOpen, Search, Plus, Minus, Home } from 'lucide-react';

// --- Variáveis Globais de Configuração do Ambiente ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};
const appId = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'secretaria-educacao-ponto'; 
let app, auth, db;
try {
    if (firebaseConfig.apiKey) { // Verificamos se a chave existe
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } else {
        console.error("Configuração do Firebase não encontrada. Verifique suas variáveis de ambiente.");
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
const ALL_ACCOUNTS = Object.values(DUMMY_ACCOUNTS); // Usado para consulta de e-mail

// --- Definições de Estilos e Constantes ---
const PRIMARY_COLOR = '#3B82F6';
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
const TARGET_DAILY_HOURS_MS = 8 * 60 * 60 * 1000; // 8 horas em milissegundos
const USER_COLLECTION = 'users';
const UNIT_COLLECTION = 'unidades';

// Dados simulados para Unidades (Escolas/Departamentos)
const UNIDADES = {
    'unidade-adm-01': { name: 'Controle e Movimentação' },
    'unidade-adm-02': { name: 'Núcleo de Logística' },
    'unidade-esc-01': { name: 'Escola Municipal A' },
};

/**
 * Hook personalizado para lidar com a autenticação e estado do usuário.
 */
function useFirebaseAuthentication() {
    const [user, setUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [role, setRole] = useState(null);

    // Função para buscar e/ou criar o perfil do usuário no Firestore
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

        const initialSignIn = async () => {
            if (isLoading) {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                        console.log("Login com token personalizado realizado.");
                    }
                } catch (error) {
                    console.error("Erro durante o login inicial:", error);
                }
            }
        };
        initialSignIn();

        return () => unsubscribe();
    }, [isLoading, fetchUserProfile]);

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


/**
 * Componentes de Utilidade (Funções de Formatação)
 */
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

const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
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

// Função para formatar milissegundos em HH:mm
const formatDuration = (ms) => {
    if (ms === 0) return '00:00';
    const sign = ms < 0 ? '-' : '';
    const absMs = Math.abs(ms);
    const totalSeconds = Math.round(absMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Componente Modal de Solicitação e Justificativa
 */
const SolicitationModal = ({ user, db, isOpen, onClose, setMessage }) => {
    const [activeTab, setActiveTab] = useState('abono'); // 'abono' ou 'justificativa'
    const [formData, setFormData] = useState({
        dataOcorrencia: new Date().toISOString().split('T')[0],
        justificativaTexto: '',
        anexoFile: null,
    });
    const [loading, setLoading] = useState(false);

    // Coleção pública de solicitações
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
            // Simulação de upload de arquivo
            let anexoUrl = '';
            if (formData.anexoFile) {
                anexoUrl = `simulated://storage/${user.matricula}/${formData.anexoFile.name}`;
                setMessage({ type: 'warning', title: 'Anexo Simulado', message: `O arquivo ${formData.anexoFile.name} foi simulado. O upload real de arquivo requer Firebase Storage.` });
            }

            const newSolicitation = {
                requesterId: user.uid,
                requesterMatricula: user.matricula,
                requesterNome: user.nome,
                unidadeId: user.unidadeId,
                tipo: activeTab, // 'abono' ou 'justificativa'
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
                message: `Sua solicitação de ${activeTab.toUpperCase()} foi enviada ao Gestor para análise. Uma notificação (simulada) será enviada por e-mail quando o status mudar.`
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
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Abas */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('abono')}
                        className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${activeTab === 'abono' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Aperture className="w-4 h-4 inline mr-2" />
                        Abono (Ajuste de Registro)
                    </button>
                    <button
                        onClick={() => setActiveTab('justificativa')}
                        className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${activeTab === 'justificativa' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <BookOpen className="w-4 h-4 inline mr-2" />
                        Justificativa (Ausência)
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Data de Ocorrência</label>
                        <input
                            type="date"
                            name="dataOcorrencia"
                            value={formData.dataOcorrencia}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Descrição Detalhada ({activeTab === 'abono' ? 'Horário Correto, Motivo do Esquecimento, etc.' : 'Motivo da Falta, Período, etc.'})
                        </label>
                        <textarea
                            name="justificativaTexto"
                            value={formData.justificativaTexto}
                            onChange={handleChange}
                            rows="4"
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        ></textarea>
                    </div>

                    <div className="space-y-1 p-3 border border-dashed rounded-lg">
                        <label className="text-sm font-medium text-gray-700 block mb-2">
                            Anexo (Atestado Médico, Comprovante)
                        </label>
                        <input
                            type="file"
                            name="anexoFile"
                            onChange={handleChange}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                         {formData.anexoFile && (
                            <p className="text-xs text-green-600 mt-2 flex items-center">
                                <File className="w-4 h-4 mr-1" />
                                Arquivo selecionado: {formData.anexoFile.name}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold transition duration-300 hover:bg-blue-600 ${loading ? 'bg-blue-400' : 'bg-blue-500'}`}
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5 mr-2" />
                        )}
                        {loading ? 'Enviando...' : 'Enviar Solicitação ao Gestor'}
                    </button>
                </form>
            </div>
        </div>
    );
};


/**
 * Componente do Dashboard do Servidor
 */
const ServidorDashboard = ({ user, userId, db, handleLogout }) => {
    const [points, setPoints] = useState([]);
    const [lastPoint, setLastPoint] = useState(null);
    const [clockInLoading, setClockInLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const pointCollectionPath = useMemo(() => `/artifacts/${appId}/users/${userId}/registros_ponto`, [userId]);
    const solicitacoesCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);
    const unidade = UNIDADES[user?.unidadeId] || UNIDADES['unidade-adm-01'];

    // 1. Hook para buscar registros de ponto em tempo real
    useEffect(() => {
        if (!db || !userId) return;

        const q = query(
            collection(db, pointCollectionPath),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPoints = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));
            setPoints(fetchedPoints);
            setLastPoint(fetchedPoints[0] || null);
        }, (error) => {
            console.error("Erro ao carregar registros de ponto:", error);
            setMessage({ type: 'error', title: 'Erro de Carga', message: 'Não foi possível carregar o histórico de ponto.' });
        });

        return () => unsubscribe();
    }, [db, userId, pointCollectionPath]);


    // --- LÓGICA DE CÁLCULO DE BANCO DE HORAS ---
    const dailySummary = useMemo(() => {
        const summary = {};
        let totalBalanceMs = 0;

        points.forEach(point => {
            const dateKey = formatDateOnly(point.timestamp);
            if (!summary[dateKey]) {
                summary[dateKey] = { points: [], totalMs: 0, balanceMs: 0 };
            }
            summary[dateKey].points.push(point);
        });

        Object.keys(summary).sort().forEach(dateKey => {
            const day = summary[dateKey];
            const sortedPoints = day.points.sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

            let totalWorkedMs = 0;
            let currentSegmentStart = null;

            // Pares de entrada/saída (entrada, pausa, volta, saida)
            for (let i = 0; i < sortedPoints.length; i++) {
                const current = sortedPoints[i];
                const type = current.tipo;
                const timestamp = current.timestamp.toDate().getTime();

                if (type === 'entrada' || type === 'volta') {
                    currentSegmentStart = timestamp;
                } else if ((type === 'saida' || type === 'pausa') && currentSegmentStart !== null) {
                    totalWorkedMs += (timestamp - currentSegmentStart);
                    currentSegmentStart = null; // Zera o contador após o segmento
                }
            }

            // Se o último ponto foi uma entrada ou volta e não houve saída/pausa
            if (currentSegmentStart !== null) {
                // Não adiciona, pois a jornada ainda está aberta
            }

            day.totalMs = totalWorkedMs;
            day.balanceMs = totalWorkedMs - TARGET_DAILY_HOURS_MS;
            totalBalanceMs += day.balanceMs;
        });

        return { summary, totalBalanceMs };
    }, [points]);

    // Fim da Lógica do Banco de Horas ---

    // LÓGICA DE NEGÓCIO: Checa se a última ação foi 'saída' e se foi hoje.
    const isShiftFinishedToday = useMemo(() => {
        if (!lastPoint || lastPoint.tipo !== 'saida') return false;

        const lastDate = lastPoint.timestamp.toDate ? lastPoint.timestamp.toDate() : new Date(lastPoint.timestamp);
        const today = new Date();

        return (
            lastDate.getDate() === today.getDate() &&
            lastDate.getMonth() === today.getMonth() &&
            lastDate.getFullYear() === today.getFullYear()
        );
    }, [lastPoint]);

    // 2. Determinar o próximo tipo de ponto a ser batido
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


    // 3. Função de Registro de Ponto
    const registerPoint = useCallback(async (type) => {
        if (!userId || nextPointType === 'finished') return;

        setClockInLoading(true);
        setMessage(null);
        const location = null;

        try {
            const newPoint = {
                userId,
                timestamp: new Date(),
                tipo: type,
                localizacao: location,
                unidadeId: user.unidadeId,
                dispositivo: navigator.userAgent,
                editado: false,
            };

            await addDoc(collection(db, pointCollectionPath), newPoint);

            setMessage({
                type: 'success',
                title: 'Ponto Registrado!',
                message: `Sua ${type.toUpperCase()} foi registrada. Simulação de e-mail de notificação enviada para ${user.email}.`
            });

        } catch (dbError) {
            console.error("Erro ao salvar o registro no Firestore:", dbError);
            setMessage({ type: 'error', title: 'Erro no Sistema', message: `Falha ao salvar o ponto no sistema: ${dbError.message}` });
        } finally {
            setClockInLoading(false);
        }
    }, [userId, db, pointCollectionPath, user?.unidadeId, nextPointType, user?.email]);

    // Hook para buscar solicitações do usuário (para o histórico)
    const [solicitacoes, setSolicitacoes] = useState([]);
    useEffect(() => {
        if (!db || !userId) return;

        const q = query(
            collection(db, solicitacoesCollectionPath),
            where('requesterId', '==', userId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Erro ao carregar solicitações:", error);
        });

        return () => unsubscribe();
    }, [db, userId, solicitacoesCollectionPath]);

    // 4. Mapeamento de botões
    const buttonMap = {
        entrada: { label: 'Entrada', icon: LogIn, color: 'bg-emerald-500 hover:bg-emerald-600', type: 'entrada' },
        pausa: { label: 'Início Pausa', icon: Pause, color: 'bg-amber-500 hover:bg-amber-600', type: 'pausa' },
        volta: { label: 'Fim Pausa', icon: RefreshCcw, color: 'bg-indigo-500 hover:bg-indigo-600', type: 'volta' },
        saida: { label: 'Saída', icon: LogOut, color: 'bg-gray-500 hover:bg-gray-600', type: 'saida' },
        finished: { label: 'Expediente Finalizado', icon: Clock, color: 'bg-gray-400', type: 'finished' },
    };

    const currentButton = buttonMap[nextPointType];
    const isButtonDisabled = clockInLoading || nextPointType === 'finished';
    const roleMap = { 'servidor': 'Servidor/Estagiário', 'gestor': 'Gestor da Unidade', 'rh': 'RH/Administrador' };

    return (
        <div className={`p-4 sm:p-8 min-h-screen bg-[${BG_COLOR}]`}>
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className={`text-3xl font-bold text-[${TEXT_COLOR}]`}>
                            <Clock className="inline-block w-8 h-8 mr-2 text-blue-500" />
                            Ponto Eletrônico
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Matrícula: <span className="font-semibold text-blue-600">{user.matricula}</span> | Perfil: {roleMap[user.role]}.
                            Unidade: {unidade.name}
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

                {/* Seção de Banco de Horas */}
                <section className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-blue-100 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Saldo Acumulado (Banco de Horas)</p>
                        <p className={`text-4xl font-extrabold mt-1 ${dailySummary.totalBalanceMs >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatDuration(dailySummary.totalBalanceMs)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            {dailySummary.totalBalanceMs >= 0 ? 'Crédito disponível para folga.' : 'Débito a ser compensado.'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500">Jornada Padrão</p>
                        <p className="text-xl font-bold text-blue-600">8h / dia</p>
                        <p className="text-xs text-gray-500 mt-1">Regime: 40h/semana</p>
                    </div>
                </section>


                {/* Seção de Registro de Ponto */}
                <section className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-blue-100">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}]`}>Registrar Ponto</h2>

                    {message && <div className="mb-4"><CustomMessage {...message} /></div>}

                    <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
                        <div className="flex-1 text-center sm:text-left">
                            <p className="text-sm text-gray-500">
                                {nextPointType === 'finished' ? 'Estado Atual:' : 'Próximo Ponto a Bater:'}
                            </p>
                            <p className={`text-4xl font-extrabold mt-1 ${nextPointType === 'finished' ? 'text-gray-500' : 'text-blue-600'}`}>
                                {currentButton.label.toUpperCase()}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                Último registro: {lastPoint ? `${lastPoint.tipo.toUpperCase()} às ${formatTime(lastPoint.timestamp)}` : 'Nenhum'}
                            </p>
                            {nextPointType === 'finished' && (
                                <p className="text-sm text-red-500 font-semibold mt-2">
                                    O sistema será reativado amanhã.
                                </p>
                            )}
                        </div>

                        <button
                            onClick={() => registerPoint(currentButton.type)}
                            disabled={isButtonDisabled}
                            className={`flex items-center justify-center w-full sm:w-auto px-8 py-3 rounded-full text-white font-semibold transition duration-300 ease-in-out transform shadow-md ${currentButton.color} ${!isButtonDisabled && 'hover:scale-105'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {clockInLoading ? (
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            ) : (
                                <currentButton.icon className="w-5 h-5 mr-2" />
                            )}
                            {clockInLoading ? 'Processando...' : currentButton.label}
                        </button>
                    </div>
                </section>

                {/* Seção de Solicitações Pendentes e Histórico */}
                <section className="bg-white p-6 rounded-xl shadow-lg mb-8">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}>
                        <Aperture className="w-5 h-5 mr-2 text-blue-500" />
                        Minhas Solicitações e Justificativas
                    </h2>

                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center text-sm font-medium bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-150 shadow-md"
                        >
                            <Send className="w-4 h-4 mr-1" />
                            Nova Solicitação
                        </button>
                    </div>

                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Data</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {solicitacoes.slice(0, 5).map((sol) => (
                                    <tr key={sol.id} className="hover:bg-blue-50 transition duration-150">
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className={`text-xs font-bold block`}>{sol.tipo.toUpperCase()}</span>
                                            <span className="text-xs text-gray-500">Em: {sol.dataOcorrencia}</span>
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-900 max-w-xs truncate">{sol.justificativaTexto}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[sol.status] || STATUS_COLORS.pendente}`}>
                                                {sol.status.toUpperCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && (
                                     <tr>
                                         <td colSpan="3" className="px-3 py-4 text-center text-gray-500 italic">
                                            Nenhuma solicitação encontrada.
                                         </td>
                                     </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>


                {/* Seção de Espelho de Ponto (Histórico) */}
                <section className="bg-white p-6 rounded-xl shadow-lg">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}>
                        <Calendar className="w-5 h-5 mr-2 text-blue-500" />
                        Espelho de Ponto (Últimos Registros)
                    </h2>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Horas Diárias</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Dia</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {Object.entries(dailySummary.summary)
                                    .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
                                    .slice(0, 10)
                                    .map(([date, data]) => (
                                    <tr key={date} className="hover:bg-blue-50 transition duration-150">
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="text-sm font-medium text-gray-900">{date}</span>
                                            <span className="text-xs text-gray-500 block">Registros: {data.points.length}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {data.points.map(p => (
                                                <span key={p.id} className={`block text-xs ${STATUS_COLORS[p.tipo]}`}>
                                                    {p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)}: {formatTime(p.timestamp)}
                                                </span>
                                            ))}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-900 hidden sm:table-cell">
                                            <span className="font-bold">{formatDuration(data.totalMs)}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className={`text-sm font-semibold ${data.balanceMs >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatDuration(data.balanceMs)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {points.length === 0 && (
                                     <tr>
                                         <td colSpan="4" className="px-3 py-4 text-center text-gray-500 italic">
                                            Nenhum registro encontrado.
                                         </td>
                                     </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <SolicitationModal
                    user={user}
                    db={db}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    setMessage={setMessage}
                />

                <footer className="mt-8 text-center text-xs text-gray-400">
                    <p>ID da Sessão: {userId}</p>
                    <p>Desenvolvido para a Secretaria de Educação - Ponto Eletrônico</p>
                </footer>
            </div>
        </div>
    );
};


// --- Componentes CRUD de Gestão (RH/ADMIN) ---

/**
 * Componente para gerenciar Usuários (Edição de Role/Unidade)
 */
const UserManagement = ({ db, appId }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);

    // Fetch All Users (Global access for RH)
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const q = query(collection(db, 'artifacts', appId, USER_COLLECTION));
                const snapshot = await getDocs(q);
                setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            } catch (error) {
                console.error("Erro ao buscar usuários:", error);
                setMessage({ type: 'error', title: 'Erro de Carga', message: 'Não foi possível carregar a lista de usuários.' });
                setLoading(false);
            }
        };
        if (db) fetchUsers();
    }, [db, appId]);

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUser) return;
        setLoading(true);

        try {
            const userDocRef = doc(db, 'artifacts', appId, USER_COLLECTION, editingUser.id);
            await updateDoc(userDocRef, {
                role: editingUser.role,
                unidadeId: editingUser.unidadeId,
            });
            setMessage({ type: 'success', title: 'Sucesso', message: `Perfil do usuário ${editingUser.matricula} atualizado.` });
            setEditingUser(null);
        } catch (error) {
            setMessage({ type: 'error', title: 'Erro', message: 'Falha ao atualizar o usuário.' });
        } finally {
            setLoading(false);
        }
    };

    // Simulação de Deleção de Usuário (Hard Delete)
    const handleDeleteUser = async (userId, matricula) => {
        if (!window.confirm(`Tem certeza que deseja DELETAR o usuário ${matricula}? Todos os registros de ponto serão perdidos.`)) return;

        try {
            const userDocRef = doc(db, 'artifacts', appId, USER_COLLECTION, userId);
            await deleteDoc(userDocRef);
            setMessage({ type: 'success', title: 'Sucesso', message: `Usuário ${matricula} deletado.` });
        } catch (error) {
            setMessage({ type: 'error', title: 'Erro', message: 'Falha ao deletar o usuário.' });
        }
    };

    const filteredUsers = users.filter(user =>
        user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.matricula.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const roleMap = { 'servidor': 'Servidor/Estagiário', 'gestor': 'Gestor da Unidade', 'rh': 'RH/Admin' };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
            <h3 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}><Users className="w-5 h-5 mr-2 text-blue-500" /> Gestão de Perfis</h3>

            {message && <div className="mb-4"><CustomMessage {...message} /></div>}

            <div className="flex mb-4">
                <div className="relative w-full">
                    <input
                        type="text"
                        placeholder="Buscar por nome ou matrícula..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 pl-10"
                    />
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matrícula/Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Perfil (Role)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidade</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="text-sm font-medium text-gray-900 block">{user.nome}</span>
                                        <span className="text-xs text-gray-500">Matrícula: {user.matricula}</span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'rh' ? 'bg-red-100 text-red-800' : user.role === 'gestor' ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}`}>
                                            {roleMap[user.role] || user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                        {UNIDADES[user.unidadeId]?.name || user.unidadeId}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => setEditingUser(user)}
                                            className="text-blue-600 hover:text-blue-800"
                                        >
                                            <Edit className="w-4 h-4 inline" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id, user.matricula)}
                                            className="text-red-600 hover:text-red-800"
                                        >
                                            <Trash2 className="w-4 h-4 inline" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingUser && (
                <div className="mt-6 p-4 border rounded-lg bg-blue-50">
                    <h4 className="text-lg font-semibold mb-3">Editar Usuário: {editingUser.nome}</h4>
                    <form onSubmit={handleUpdateUser} className="space-y-3">
                        <select
                            value={editingUser.role}
                            onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            <option value="servidor">Servidor/Estagiário</option>
                            <option value="gestor">Gestor da Unidade</option>
                            <option value="rh">Administrador/RH</option>
                        </select>
                        <select
                            value={editingUser.unidadeId}
                            onChange={(e) => setEditingUser({...editingUser, unidadeId: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            {Object.entries(UNIDADES).map(([id, unit]) => (
                                <option key={id} value={id}>{unit.name}</option>
                            ))}
                        </select>
                        <div className="flex justify-end space-x-2">
                            <button
                                type="button"
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className={`px-4 py-2 text-white rounded-lg ${loading ? 'bg-blue-400' : 'bg-blue-500 hover:bg-blue-600'}`}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Alterações'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

/**
 * Componente para gerenciar Unidades (CRUD Simulado)
 */
const UnitManagement = ({ db, appId }) => {
    const [units, setUnits] = useState(Object.entries(UNIDADES).map(([id, data]) => ({ id, ...data })));
    const [newUnitName, setNewUnitName] = useState('');
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    // Simulação de Adição de Unidade (apenas local e no objeto global simulado)
    const handleAddUnit = (e) => {
        e.preventDefault();
        if (!newUnitName.trim()) return;

        setLoading(true);
        setTimeout(() => {
            const newId = `unidade-new-${Math.random().toString(36).substring(2, 9)}`;
            const newUnit = { id: newId, name: newUnitName.trim() };

            // Simula adição à lista global e Firestore
            UNIDADES[newId] = { name: newUnit.name };
            setUnits([...units, newUnit]);
            setNewUnitName('');
            setMessage({ type: 'success', title: 'Sucesso', message: `Unidade "${newUnit.name}" adicionada (simulado).` });
            setLoading(false);
        }, 1000);
    };

    // Simulação de Deleção de Unidade
    const handleDeleteUnit = (unitId, unitName) => {
        if (!window.confirm(`Tem certeza que deseja DELETAR a unidade "${unitName}"?`)) return;

        setLoading(true);
        setTimeout(() => {
            // Simula remoção da lista global e Firestore
            delete UNIDADES[unitId];
            setUnits(units.filter(unit => unit.id !== unitId));
            setMessage({ type: 'success', title: 'Sucesso', message: `Unidade "${unitName}" removida (simulado).` });
            setLoading(false);
        }, 1000);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
             <h3 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}><Home className="w-5 h-5 mr-2 text-blue-500" /> Gestão de Unidades</h3>

             {message && <div className="mb-4"><CustomMessage {...message} /></div>}

             {/* Formulário de Adição */}
             <form onSubmit={handleAddUnit} className="mb-6 p-4 border border-dashed rounded-lg flex space-x-2">
                <input
                    type="text"
                    placeholder="Nome da Nova Unidade (Ex: Escola Z)"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    required
                    className="flex-grow px-3 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className={`px-4 py-2 text-white rounded-lg font-semibold flex items-center ${loading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-1" />}
                    Adicionar
                </button>
             </form>

            {/* Lista de Unidades */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID da Unidade</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {units.map(unit => (
                            <tr key={unit.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-500">{unit.id}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{unit.name}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleDeleteUnit(unit.id, unit.name)}
                                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                        disabled={loading}
                                    >
                                        <Trash2 className="w-4 h-4 inline" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

/**
 * Componente do Dashboard do RH/Administrador
 */
const RHAdminDashboard = ({ user, handleLogout, db }) => {
    const [activeTab, setActiveTab] = useState('reports'); // 'reports', 'users', 'units'
    const [selectedUnit, setSelectedUnit] = useState('unidade-adm-01');
    const [selectedMonth, setSelectedMonth] = useState('2025-09');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const handleGenerateReport = (format) => {
        setLoading(true);
        setMessage(null);

        // Simulação de processamento e exportação de relatório
        setTimeout(() => {
            setLoading(false);
            setMessage({
                type: 'success',
                title: `Relatório Gerado (${format.toUpperCase()})`,
                message: `Folha de Ponto Consolidada para ${UNIDADES[selectedUnit].name}, Mês: ${selectedMonth}. Exportação para ${format.toUpperCase()} simulada com sucesso.`
            });
        }, 2000);
    };

    const roleMap = { 'servidor': 'Servidor/Estagiário', 'gestor': 'Gestor da Unidade', 'rh': 'RH/Administrador' };
    const months = ['2025-09', '2025-08', '2025-07'];

    return (
        <div className={`p-4 sm:p-8 min-h-screen bg-[${BG_COLOR}]`}>
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className={`text-3xl font-bold text-[${TEXT_COLOR}]`}>
                            <Briefcase className="inline-block w-8 h-8 mr-2 text-blue-500" />
                            Painel de Administração (RH)
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600">{user.nome}</span>. Perfil: {roleMap[user.role]}.
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

                {/* Abas de Navegação */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`flex items-center py-3 px-6 text-sm font-medium transition-all duration-200 ${activeTab === 'reports' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <FileText className="w-4 h-4 mr-2" /> Relatórios e Métricas
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center py-3 px-6 text-sm font-medium transition-all duration-200 ${activeTab === 'users' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Users className="w-4 h-4 mr-2" /> Gestão de Usuários
                    </button>
                    <button
                        onClick={() => setActiveTab('units')}
                        className={`flex items-center py-3 px-6 text-sm font-medium transition-all duration-200 ${activeTab === 'units' ? `text-blue-600 border-b-2 border-blue-600` : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Home className="w-4 h-4 mr-2" /> Gestão de Unidades
                    </button>
                </div>


                {/* Conteúdo da Aba: Relatórios e Métricas */}
                {activeTab === 'reports' && (
                    <>
                        <h2 className={`text-2xl font-bold mb-4 text-[${TEXT_COLOR}] flex items-center`}>
                            <Aperture className="w-6 h-6 mr-2 text-blue-500" />
                            Relatórios Gerenciais e Métricas
                        </h2>

                        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Horas Extras (Mês)</p>
                                    <p className="text-3xl font-bold text-blue-600">850h</p>
                                </div>
                                <Clock className="w-8 h-8 text-blue-400 opacity-50" />
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Absenteísmo (Mês)</p>
                                    <p className="text-3xl font-bold text-red-500">2.1%</p>
                                </div>
                                <XCircle className="w-8 h-8 text-red-400 opacity-50" />
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total de Servidores</p>
                                    <p className="text-3xl font-bold text-green-600">250</p>
                                </div>
                                <Users className="w-8 h-8 text-green-400 opacity-50" />
                            </div>
                        </section>

                        <section className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
                            <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}>
                                <FileText className="w-5 h-5 mr-2 text-blue-500" />
                                Gerar Folha de Ponto Consolidada
                            </h2>
                            <p className="text-sm text-gray-500 mb-4">Selecione o período e a unidade para gerar o relatório para fins de gestão ou financeiro.</p>

                            {message && <div className="mb-4"><CustomMessage {...message} /></div>}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label htmlFor="unit-filter" className="text-sm font-medium text-gray-700">Unidade/Departamento</label>
                                    <select
                                        id="unit-filter"
                                        value={selectedUnit}
                                        onChange={(e) => setSelectedUnit(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        {Object.entries(UNIDADES).map(([id, unit]) => (
                                            <option key={id} value={id}>{unit.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="month-filter" className="text-sm font-medium text-gray-700">Mês de Referência</label>
                                    <select
                                        id="month-filter"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        {months.map(month => (
                                            <option key={month} value={month}>{month}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex space-x-2 pt-6">
                                    <button
                                        onClick={() => handleGenerateReport('pdf')}
                                        disabled={loading}
                                        className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg text-white font-semibold transition duration-300 shadow-md disabled:opacity-50 ${loading ? 'bg-gray-400' : 'bg-red-500 hover:bg-red-600'}`}
                                    >
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Download className="w-5 h-5 mr-1" />}
                                        PDF
                                    </button>
                                    <button
                                        onClick={() => handleGenerateReport('excel')}
                                        disabled={loading}
                                        className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg text-white font-semibold transition duration-300 shadow-md disabled:opacity-50 ${loading ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'}`}
                                    >
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Download className="w-5 h-5 mr-1" />}
                                        Excel
                                    </button>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* Conteúdo da Aba: Gestão de Usuários */}
                {activeTab === 'users' && <UserManagement db={db} appId={appId} />}

                {/* Conteúdo da Aba: Gestão de Unidades */}
                {activeTab === 'units' && <UnitManagement db={db} appId={appId} />}

                <footer className="mt-8 text-center text-xs text-gray-400">
                    <p>ID da Sessão: {user.uid}</p>
                    <p>Desenvolvido para a Secretaria de Educação - Ponto Eletrônico</p>
                    <p className="mt-2 text-xs text-red-500 font-semibold">
                        NOTA DE SEGURANÇA: Para um sistema profissional, implemente as Regras de Segurança do Firestore para garantir que o RH só possa ler o banco de dados global (artifacts/appId/users) e os servidores só possam ler/escrever em seus próprios documentos (artifacts/appId/users/userId/registros_ponto).
                    </p>
                </footer>
            </div>
        </div>
    );
};


/**
 * Componente do Dashboard do Gestor
 */
const GestorDashboard = ({ user, handleLogout, db }) => {
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [message, setMessage] = useState(null);
    const [loadingAction, setLoadingAction] = useState(null);

    const solicitacoesCollectionPath = useMemo(() => `/artifacts/${appId}/public/data/solicitacoes`, []);
    const unidade = UNIDADES[user?.unidadeId] || UNIDADES['unidade-adm-01'];

    // 1. Hook para buscar solicitações PENDENTES da unidade do Gestor
    useEffect(() => {
        if (!db || !user?.unidadeId) return;

        const q = query(
            collection(db, solicitacoesCollectionPath),
            where('unidadeId', '==', user.unidadeId),
            where('status', '==', 'pendente'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSolicitacoes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Erro ao carregar solicitações pendentes:", error);
            setMessage({ type: 'error', title: 'Erro de Carga', message: 'Não foi possível carregar as solicitações.' });
        });

        return () => unsubscribe();
    }, [db, solicitacoesCollectionPath, user?.unidadeId]);

    // 2. Função de Aprovação/Reprovação
    const handleAction = useCallback(async (solicitationId, newStatus) => {
        setLoadingAction(solicitationId);
        setMessage(null);

        try {
            const solDocRef = doc(db, solicitacoesCollectionPath, solicitationId);
            await updateDoc(solDocRef, {
                status: newStatus,
                gestorId: user.uid,
                dataAprovacao: new Date(),
            });

            // Simulação de e-mail para o servidor
            setMessage({
                type: 'success',
                title: `Solicitação ${newStatus.toUpperCase()}`,
                message: `A solicitação foi ${newStatus === 'aprovado' ? 'APROVADA' : 'REPROVADA'} com sucesso. E-mail de notificação (simulado) enviado ao servidor.`
            });

        } catch (error) {
            console.error(`Erro ao ${newStatus} solicitação:`, error);
            setMessage({ type: 'error', title: 'Erro de Processamento', message: `Falha ao atualizar o status: ${error.message}` });
        } finally {
            setLoadingAction(null);
        }
    }, [db, solicitacoesCollectionPath, user?.uid]);

    const roleMap = { 'servidor': 'Servidor/Estagiário', 'gestor': 'Gestor da Unidade', 'rh': 'RH/Administrador' };

    return (
        <div className={`p-4 sm:p-8 min-h-screen bg-[${BG_COLOR}]`}>
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 border-b pb-4 flex justify-between items-center">
                    <div>
                        <h1 className={`text-3xl font-bold text-[${TEXT_COLOR}]`}>
                            <User className="inline-block w-8 h-8 mr-2 text-blue-500" />
                            Painel do Gestor
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Bem-vindo(a), <span className="font-semibold text-blue-600">{user.nome}</span>. Unidade: {unidade.name}.
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

                {/* Status e Estatísticas */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Solicitações Pendentes</p>
                            <p className="text-3xl font-bold text-amber-500">{solicitacoes.length}</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-amber-400 opacity-50" />
                    </div>
                    {/* Placeholder para outras métricas */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Servidores Presentes</p>
                            <p className="text-3xl font-bold text-green-600">-- / --</p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-green-400 opacity-50" />
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Espelho de Ponto p/ Validação</p>
                            <p className="text-3xl font-bold text-blue-600">0</p>
                        </div>
                        <Calendar className="w-8 h-8 text-blue-400 opacity-50" />
                    </div>
                </section>

                {/* Lista de Solicitações Pendentes */}
                <section className="bg-white p-6 rounded-xl shadow-lg border border-blue-100">
                    <h2 className={`text-xl font-semibold mb-4 text-[${TEXT_COLOR}] flex items-center`}>
                        <Mail className="w-5 h-5 mr-2 text-amber-500" />
                        Solicitações Pendentes de Aprovação ({solicitacoes.length})
                    </h2>

                    {message && <div className="mb-4"><CustomMessage {...message} /></div>}

                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matrícula/Nome</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo/Data Ocorrência</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Justificativa</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {solicitacoes.map((sol) => (
                                    <tr key={sol.id} className="hover:bg-amber-50 transition duration-150">
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="text-sm font-medium text-gray-900 block">{sol.requesterNome}</span>
                                            <span className="text-xs text-gray-500">Matrícula: {sol.requesterMatricula}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${sol.tipo === 'abono' ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'}`}>
                                                {sol.tipo.toUpperCase()}
                                            </span>
                                            <span className="text-xs text-gray-500 block mt-1">Ocorrência: {sol.dataOcorrencia}</span>
                                        </td>
                                        <td className="px-3 py-3 text-sm text-gray-600 max-w-xs truncate" title={sol.justificativaTexto}>
                                            {sol.justificativaTexto}
                                            {sol.anexoUrl && <span className="text-blue-500 text-xs block mt-1 flex items-center"><File className="w-3 h-3 mr-1" /> Anexo (Simulado)</span>}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                            <button
                                                onClick={() => handleAction(sol.id, 'aprovado')}
                                                disabled={loadingAction === sol.id}
                                                className={`py-1 px-3 rounded-full text-xs font-semibold shadow-sm transition duration-150 ${loadingAction === sol.id ? 'bg-gray-200 text-gray-500' : 'bg-green-500 text-white hover:bg-green-600'}`}
                                            >
                                                {loadingAction === sol.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aprovar'}
                                            </button>
                                            <button
                                                onClick={() => handleAction(sol.id, 'reprovado')}
                                                disabled={loadingAction === sol.id}
                                                className={`py-1 px-3 rounded-full text-xs font-semibold shadow-sm transition duration-150 ${loadingAction === sol.id ? 'bg-gray-200 text-gray-500' : 'bg-red-500 text-white hover:bg-red-600'}`}
                                            >
                                                {loadingAction === sol.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reprovar'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {solicitacoes.length === 0 && (
                                     <tr>
                                         <td colSpan="4" className="px-3 py-4 text-center text-gray-500 italic">
                                            Nenhuma solicitação pendente encontrada.
                                         </td>
                                     </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <footer className="mt-8 text-center text-xs text-gray-400">
                    <p>ID da Sessão: {user.uid}</p>
                    <p>Desenvolvido para a Secretaria de Educação - Ponto Eletrônico</p>
                </footer>
            </div>
        </div>
    );
};


/**
 * Componente principal da Aplicação (App Router)
 */
export default function App() {
    const { user, userId, role, isAuthReady, isLoading, db, auth, fetchUserProfile, handleLogout } = useFirebaseAuthentication();
    const [currentAuthView, setCurrentView] = useState('login');

    if (isLoading || !isAuthReady) {
        return <LoadingScreen />;
    }

    // Gerencia as telas de Autenticação (Login, Cadastro, Recuperação)
    if (!user || !db || !userId) {
        return (
            <div className={`flex flex-col items-center justify-center min-h-screen bg-[${BG_COLOR}] p-4`}>
                {currentAuthView === 'login' && <LoginScreen setCurrentView={setCurrentView} auth={auth} fetchUserProfile={fetchUserProfile} />}
                {currentAuthView === 'register' && <RegistrationScreen setCurrentView={setCurrentView} auth={auth} fetchUserProfile={fetchUserProfile} />}
                {currentAuthView === 'recover' && <PasswordRecoveryScreen setCurrentView={setCurrentView} />}
            </div>
        );
    }

    // Roteamento baseado no Perfil (Role)
    switch (role) {
        case 'servidor':
            return <ServidorDashboard user={user} userId={userId} db={db} handleLogout={handleLogout} />;
        case 'gestor':
            return <GestorDashboard user={user} handleLogout={handleLogout} db={db} />;
        case 'rh':
            return <RHAdminDashboard user={user} handleLogout={handleLogout} db={db} appId={appId} />;
        default:
            return (
                <div className={`p-8 min-h-screen bg-[${BG_COLOR}]`}>
                    <div className="max-w-4xl mx-auto text-center bg-white p-8 rounded-xl shadow-lg">
                        <h1 className={`text-3xl font-bold text-red-500 mb-4`}>Perfil Desconhecido</h1>
                        <p className="text-lg text-gray-600">Entre em contato com o suporte.</p>
                        <button
                            onClick={handleLogout}
                            className="mt-6 flex items-center mx-auto text-sm font-medium text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50"
                        >
                            <LogOut className="w-4 h-4 mr-1" />
                            Sair
                        </button>
                    </div>
                </div>
            );
    }
}


/**
 * Componentes de Autenticação (Mantidos no final do arquivo)
 */
const PasswordRecoveryScreen = ({ setCurrentView }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const handleRecovery = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        const accountExists = ALL_ACCOUNTS.some(acc => acc.email === email);

        if (accountExists) {
            setTimeout(() => {
                setMessage({
                    type: 'success',
                    title: 'E-mail Enviado',
                    message: `Instruções de recuperação foram enviadas para ${email}. Verifique sua caixa de entrada.`
                });
                setLoading(false);
                setEmail('');
            }, 1500);
        } else {
            setMessage({
                type: 'error',
                title: 'E-mail Não Encontrado',
                message: 'O e-mail institucional não está cadastrado. Verifique a digitação.'
            });
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl border border-blue-100 max-w-md w-full">
            <Mail className="w-10 h-10 mx-auto text-blue-500 mb-4" />
            <h2 className={`text-2xl font-bold text-[${TEXT_COLOR}] mb-6 text-center`}>Recuperar Senha</h2>
            {message && <div className="mb-4"><CustomMessage {...message} /></div>}
            <form onSubmit={handleRecovery} className="space-y-4">
                <input type="email" placeholder="E-mail Institucional" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150" />
                <button type="submit" disabled={loading} className={`w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold transition duration-300 hover:bg-blue-600 ${loading ? 'bg-blue-400' : 'bg-blue-500'}`}>
                    {loading ? (<Loader2 className="w-5 h-5 mr-2 animate-spin" />) : ('Enviar E-mail de Recuperação')}
                </button>
            </form>
            <button onClick={() => setCurrentView('login')} className="mt-4 flex items-center mx-auto text-sm text-gray-600 hover:text-blue-500 transition duration-150">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar ao Login
            </button>
        </div>
    );
};

const RegistrationScreen = ({ setCurrentView, auth, fetchUserProfile }) => {
    const [formData, setFormData] = useState({ name: '', matricula: '', email: '', password: '', role: 'servidor' });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        if (DUMMY_ACCOUNTS[formData.matricula]) {
             setMessage({ type: 'error', title: 'Matrícula Existente', message: 'Esta matrícula já está cadastrada.' });
             setLoading(false);
             return;
        }

        try {
            const result = await signInAnonymously(auth);
            const uid = result.user.uid;
            await fetchUserProfile(uid, formData.email, formData.role, formData.matricula);
            await updateDoc(doc(db, 'artifacts', appId, USER_COLLECTION, uid), {
                nome: formData.name,
                matricula: formData.matricula,
            });
            setMessage({ type: 'success', title: 'Cadastro Efetuado', message: 'Seu acesso foi criado! Você será redirecionado em breve.' });

        } catch (e) {
            console.error("Erro no cadastro simulado:", e);
            setMessage({ type: 'error', title: 'Erro de Sistema', message: 'Não foi possível completar o cadastro. Tente mais tarde.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl border border-blue-100 max-w-md w-full">
            <Users className="w-10 h-10 mx-auto text-blue-500 mb-4" />
            <h2 className={`text-2xl font-bold text-[${TEXT_COLOR}] mb-6 text-center`}>Cadastro de Servidor</h2>
            {message && <div className="mb-4"><CustomMessage {...message} /></div>}
            <form onSubmit={handleRegister} className="space-y-4">
                 <input type="text" name="name" placeholder="Nome Completo" value={formData.name} onChange={handleChange} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                <input type="text" name="matricula" placeholder="Matrícula (Ex: 50005)" value={formData.matricula} onChange={handleChange} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                <input type="email" name="email" placeholder="E-mail Institucional" value={formData.email} onChange={handleChange} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                <input type="password" name="password" placeholder="Senha" value={formData.password} onChange={handleChange} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                <select name="role" value={formData.role} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
                    <option value="servidor">Servidor/Estagiário</option>
                    <option value="gestor">Gestor da Unidade</option>
                    <option value="rh">Administrador/RH</option>
                </select>
                <button type="submit" disabled={loading} className={`w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold transition duration-300 hover:bg-blue-600 ${loading ? 'bg-blue-400' : 'bg-blue-500'}`}>
                    {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : 'Cadastrar'}
                </button>
            </form>
            <button onClick={() => setCurrentView('login')} className="mt-4 flex items-center mx-auto text-sm text-gray-600 hover:text-blue-500 transition duration-150">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar ao Login
            </button>
        </div>
    );
};

const LoginScreen = ({ setCurrentView, auth, fetchUserProfile }) => {
    const [matricula, setMatricula] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const account = DUMMY_ACCOUNTS[matricula];

        if (account && account.password === password) {
            try {
                const result = await signInAnonymously(auth);
                const uid = result.user.uid;
                await fetchUserProfile(uid, account.email, account.role, matricula);

            } catch (e) {
                console.error("Erro no login anônimo simulado:", e);
                setError("Erro de sistema ao tentar autenticar. Tente novamente.");
            }
        } else {
            setError("Matrícula ou senha incorretos. Use as contas de demonstração.");
        }

        setLoading(false);
    };

    const roleLabels = {
        '10001': 'RH/Admin',
        '20002': 'Gestor',
        '30003': 'Servidor',
        '40004': 'Estagiário'
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl border border-blue-100 max-w-md w-full">
            <LogIn className="w-10 h-10 mx-auto text-blue-500 mb-4" />
            <h2 className={`text-2xl font-bold text-[${TEXT_COLOR}] mb-6 text-center`}>
                Acesso ao Ponto Eletrônico
            </h2>

            <form onSubmit={handleLogin} className="space-y-4">
                <input type="text" placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150" />
                <input type="password" placeholder="Senha (123)" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150" />

                {error && <CustomMessage type="error" title="Falha no Login" message={error} />}

                <button type="submit" disabled={loading} className={`w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-semibold transition duration-300 hover:bg-blue-600 ${loading ? 'bg-blue-400' : 'bg-blue-500'}`}>
                    {loading ? (<Loader2 className="w-5 h-5 mr-2 animate-spin" />) : (<LogIn className="w-5 h-5 mr-2" />)}
                    {loading ? 'Entrando...' : 'Entrar no Sistema'}
                </button>
            </form>

            <div className="flex justify-between text-sm mt-4">
                <button onClick={() => setCurrentView('recover')} className="text-gray-500 hover:text-blue-600">
                    Esqueceu a Senha?
                </button>
                <button onClick={() => setCurrentView('register')} className="text-blue-500 hover:text-blue-700 font-semibold">
                    Cadastrar-se
                </button>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
                <h3 className={`text-sm font-semibold text-[${TEXT_COLOR}] mb-2`}>Contas de Demonstração (Senha: 123)</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                    {Object.entries(roleLabels).map(([matricula, label]) => (
                        <li key={matricula} className="flex justify-between">
                            <span>{label}:</span>
                            <span className="font-mono bg-gray-100 px-1 rounded">{matricula}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

