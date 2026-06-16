(function () {
  const firebaseConfig = window.PROICE_FIREBASE_CONFIG;
  const storeConfig = window.PROICE_FIREBASE_STORE || { collection: "proice", documentId: "main" };

  if (!firebaseConfig) {
    throw new Error("Configure o arquivo firebase-config.js antes de abrir o app.");
  }

  if (!window.firebase) {
    throw new Error("Firebase SDK nao carregado.");
  }

  firebase.initializeApp(firebaseConfig);

  const db = firebase.firestore();
  const stateDocRef = db.collection(storeConfig.collection).doc(storeConfig.documentId);
  const migrationKey = "app_proice_v2_gastos_migrados_firestore_v1";

  function generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function parsePtDate(data, hora) {
    const dateParts = String(data || "").split("/");

    if (dateParts.length !== 3) {
      return new Date();
    }

    const [day, month, year] = dateParts.map(Number);
    const timeParts = String(hora || "00:00:00").split(":").map(Number);
    const [hours = 0, minutes = 0, seconds = 0] = timeParts;
    const parsed = new Date(year, month - 1, day, hours, minutes, seconds);

    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function formatExpenseDate(createdAt) {
    const date = new Date(createdAt);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

    return {
      data: safeDate.toLocaleDateString("pt-BR"),
      hora: safeDate.toLocaleTimeString("pt-BR"),
    };
  }

  function normalizeExpense(expense) {
    const amount = Number(expense.amount ?? expense.valor) || 0;
    const description = String(expense.description || expense.descricao || "").trim();
    const responsible = String(expense.responsible || expense.responsavel || "Sem responsavel").trim();
    const createdAt = expense.createdAt || expense.criadoEm || new Date().toISOString();
    const formattedDate = formatExpenseDate(createdAt);

    return {
      id: expense.id || generateId("expense"),
      description,
      descricao: description,
      responsible,
      responsavel: responsible,
      source: expense.source || expense.origem || "",
      origem: expense.origem || expense.source || "",
      category: String(expense.category || expense.categoria || "App financeiro").trim(),
      amount,
      valor: amount,
      createdAt,
      ...formattedDate,
    };
  }

  function getManualExpenses(state) {
    return Array.isArray(state.manualExpenses) ? state.manualExpenses.map(normalizeExpense) : [];
  }

  function getExpenseSignature(expense) {
    return [
      String(expense.description || expense.descricao || "").trim().toLowerCase(),
      Number(expense.amount ?? expense.valor).toFixed(2),
      String(expense.createdAt || expense.data || ""),
    ].join("|");
  }

  function hashText(value) {
    return String(value).split("").reduce((hash, char) => {
      return (hash << 5) - hash + char.charCodeAt(0);
    }, 0);
  }

  function readLocalExpenses() {
    const gastos = JSON.parse(localStorage.getItem("gastos") || "[]");
    const relatorio = JSON.parse(localStorage.getItem("relatorioMensal") || "[]");
    const bySignature = new Map();

    [...gastos, ...relatorio].forEach((expense) => {
      const description = String(expense.descricao || expense.description || "").trim();
      const amount = Number(expense.valor ?? expense.amount);

      if (!description || Number.isNaN(amount) || amount <= 0) {
        return;
      }

      const createdAt = expense.createdAt || parsePtDate(expense.data, expense.hora).toISOString();
      const normalized = {
        id: expense.id || `appv2-${Math.abs(hashText(`${description}|${amount}|${createdAt}`))}`,
        description,
        responsible: expense.responsible || expense.responsavel || "Sem responsavel",
        source: "app_proice_v2",
        origem: "app_proice_v2",
        category: expense.category || expense.categoria || "App financeiro",
        amount,
        createdAt,
      };

      bySignature.set(getExpenseSignature(normalized), normalized);
    });

    return Array.from(bySignature.values());
  }

  function observeExpenses(onChange, onError = console.error) {
    return stateDocRef.onSnapshot(
      (snapshot) => {
        if (!snapshot.exists) {
          stateDocRef.set({ manualExpenses: [] }, { merge: true });
          onChange([]);
          return;
        }

        const expenses = getManualExpenses(snapshot.data())
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        onChange(expenses);
      },
      onError
    );
  }

  async function addExpense({ responsible, description, amount }) {
    const cleanResponsible = String(responsible || "").trim();
    const cleanDescription = String(description || "").trim();
    const cleanAmount = Number(amount);

    if (!cleanResponsible) {
      throw new Error("Informe quem esta lancando.");
    }

    if (!cleanDescription) {
      throw new Error("Preencha a descricao.");
    }

    if (Number.isNaN(cleanAmount) || cleanAmount <= 0) {
      throw new Error("Informe um valor valido.");
    }

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateDocRef);
      const state = snapshot.exists ? snapshot.data() : {};
      const manualExpenses = getManualExpenses(state);

      manualExpenses.unshift({
        id: generateId("expense"),
        description: cleanDescription,
        responsible: cleanResponsible,
        responsavel: cleanResponsible,
        source: "app_proice_v2",
        origem: "app_proice_v2",
        category: "App financeiro",
        amount: cleanAmount,
        createdAt: new Date().toISOString(),
      });

      transaction.set(stateDocRef, { ...state, manualExpenses });
    });
  }

  async function deleteExpense(id) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateDocRef);
      const state = snapshot.exists ? snapshot.data() : {};
      const manualExpenses = getManualExpenses(state).filter((expense) => expense.id !== id);

      transaction.set(stateDocRef, { ...state, manualExpenses });
    });
  }

  async function migrateLocalExpenses() {
    if (localStorage.getItem(migrationKey) === "sim") {
      return;
    }

    const localExpenses = readLocalExpenses();

    if (!localExpenses.length) {
      localStorage.setItem(migrationKey, "sim");
      return;
    }

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateDocRef);
      const state = snapshot.exists ? snapshot.data() : {};
      const manualExpenses = getManualExpenses(state);
      const existingSignatures = new Set(manualExpenses.map(getExpenseSignature));
      const nextExpenses = [...manualExpenses];

      localExpenses.forEach((expense) => {
        if (!existingSignatures.has(getExpenseSignature(expense))) {
          nextExpenses.unshift(expense);
        }
      });

      transaction.set(stateDocRef, { ...state, manualExpenses: nextExpenses });
    });

    localStorage.setItem(migrationKey, "sim");
  }

  window.ProiceFinanceiro = {
    addExpense,
    deleteExpense,
    migrateLocalExpenses,
    observeExpenses,
  };
})();
