# 📊 SITEC - Painel de Produtividade (Ticker)


[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![Create React App](https://img.shields.io/badge/CRA-5-09D3AC?logo=createreactapp&logoColor=white)](https://create-react-app.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-v12-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

Um painel de dashboard simples e em tempo real, projetado para exibir estatísticas de produtividade (total de processos e último processo) de uma coleção do Firestore. Ideal para ser exibido em monitores de escritório.

---

## 📜 Tabela de Conteúdos

* [Sobre o Projeto](#-sobre-o-projeto)
* [Principais Funcionalidades](#✨-principais-funcionalidades)
* [Tecnologias Utilizadas](#-tecnologias-utilizadas)
* [Começando](#-começando)
    * [Pré-requisitos](#pré-requisitos)
    * [Instalação](#instalação)
    * [Configurando Variáveis de Ambiente](#-configurando-variáveis-de-ambiente)
* [Configuração do Firebase](#🔥-configuração-do-firebase)
* [Scripts Disponíveis](#-scripts-disponíveis)
* [Deploy (Vercel)](#-deploy-vercel)

---

## 📖 Sobre o Projeto

O **SITEC - Painel (Ticker)** é uma aplicação de página única (SPA) cuja única função é atuar como um "ticker" de produtividade.

Ele se conecta diretamente à coleção `processes` no Firestore e usa `onSnapshot` para ouvir mudanças em tempo real. A tela exibe o número total de documentos (processos) na coleção e os detalhes do processo mais recente, identificado por um campo de timestamp.

É uma ferramenta de visualização passiva, sem login ou entrada de dados, perfeita para transparência interna da equipe.

## ✨ Principais Funcionalidades

* **Dashboard em Tempo Real:** Os números são atualizados instantaneamente via Firebase `onSnapshot`, sem a necessidade de atualizar a página.
* **Contador Total:** Exibe o número total de processos na coleção.
* **Último Processo:** Exibe os detalhes (`nProcesso`, `interessado`, `servidor`) do último processo adicionado.
* **Interface Limpa:** Design minimalista focado nos dados, feito com Tailwind CSS em "dark mode".
* **Leve e Rápido:** Construído com Create React App para uma performance ágil.

## 🛠️ Tecnologias Utilizadas

* **Frontend:** React 18 (com Hooks)
* **Build Tool:** Create React App (`react-scripts`)
* **Backend (BaaS):**
    * **Firebase Firestore:** Banco de dados NoSQL para leitura em tempo real.
* **Estilização:**
    * TailwindCSS

---

## 🏃 Começando

Siga estas instruções para configurar e rodar o projeto localmente.

### Pré-requisitos

* [Node.js (v18+)](https://nodejs.org/)
* [Git](https://git-scm.com/)
* Uma conta no **Firebase** com um projeto criado.

### Instalação

1.  Clone o repositório:
    ```bash
    git clone [https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git](https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git)
    ```
2.  Navegue até a pasta do projeto:
    ```bash
    cd SEU-REPOSITORIO
    ```
3.  Instale as dependências:
    ```bash
    npm install
    ```

### Configurando Variáveis de Ambiente

Por segurança, você **não deve** deixar suas chaves do Firebase hardcoded no código (`src/index.js`). Siga estes passos para usar variáveis de ambiente.

1.  Na raiz do projeto, crie um arquivo chamado `.env.local`.
2.  Adicione suas chaves do Firebase, **usando o prefixo `REACT_APP_`** (obrigatório pelo Create React App):

    ```env
    # .env.local

    # Substitua pelos dados do seu projeto no Firebase
    REACT_APP_FIREBASE_API_KEY=AIza...
    REACT_APP_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
    REACT_APP_FIREBASE_PROJECT_ID=seu-projeto
    REACT_APP_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID=12345...
    REACT_APP_FIREBASE_APP_ID=1:12345:...
    ```

3.  **IMPORTANTE:** Modifique seu arquivo `src/index.js` para ler essas variáveis.
    * Encontre o objeto `firebaseConfig` que está hardcoded.
    * **Substitua-o** por este:

    ```javascript
    // src/index.js

    // ... outros imports
    import { initializeApp } from "firebase/app";
    import { getFirestore } from "firebase/firestore";

    // SUBSTITUA O OBJETO HARDCODED POR ESTE
    const firebaseConfig = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID
    };

    // O resto do arquivo permanece igual
    const app = initializeApp(firebaseConfig);
    export const db = getFirestore(app);

    const root = ReactDOM.createRoot(document.getElementById('root'));
    // ...
    ```

## 🔥 Configuração do Firebase

1.  **Criar o Banco de Dados:**
    * Vá ao seu Console do Firebase.
    * Em **Firestore Database**, crie um banco de dados.
    * **Inicie em Modo de Teste** para permitir leituras (este painel não requer autenticação).
        *Atenção: Em produção, restrinja o acesso de escrita e permita apenas leitura anônima da coleção `processes`.*

2.  **Estrutura de Dados (Obrigatória):**
    * O painel **exige** que exista uma coleção chamada `processes`.
    * Os documentos dentro de `processes` devem ter a seguinte estrutura (campos que o `App.js` espera):
        * `nProcesso` (String ou Number)
        * `interessado` (String)
        * `servidor` (String)
        * `data` (Timestamp) - **Obrigatório** para a lógica de "Último Processo" funcionar.

## 🖥️ Scripts Disponíveis

* **Para rodar o app em modo de desenvolvimento:**
    ```bash
    npm start
    ```
    (Acesse `http://localhost:3000`)

* **Para construir a versão de produção:**
    ```bash
    npm run build
    ```

* **Para rodar os testes:**
    ```bash
    npm test
    ```

## ☁️ Deploy (Vercel)

1.  Envie seu projeto para um repositório no GitHub.
2.  Conecte sua conta Vercel ao GitHub e importe o projeto.
3.  A Vercel deve detectar automaticamente que é um projeto **Create React App**.
4.  Antes de fazer o deploy, vá para **Settings** -> **Environment Variables** e adicione todas as chaves `REACT_APP_...` que você colocou no seu arquivo `.env.local`.
5.  Clique em **Deploy**.
