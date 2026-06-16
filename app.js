const descricaoInput = document.getElementById("descricao");
const descricoesSalvas = document.getElementById("descricoesSalvas");
const responsavelInput = document.getElementById("responsavel");
const responsaveisSalvos = document.getElementById("responsaveisSalvos");
const valorInput = document.getElementById("valor");
const lista = document.getElementById("lista");
const btnSalvar = document.getElementById("btnSalvar");
const btnPdf = document.getElementById("btnPdf");
const totalSpan = document.getElementById("total");
const { addExpense, deleteExpense, migrateLocalExpenses, observeExpenses } = window.ProiceFinanceiro;

let gastos = [];
let historicoDescricoes = JSON.parse(localStorage.getItem("historicoDescricoes") || "[]");
let historicoResponsaveis = JSON.parse(localStorage.getItem("historicoResponsaveis") || "[]");

renderizarDescricoesSalvas();
renderizarResponsaveisSalvos();
lista.innerHTML = `<div class="gasto-item"><strong>Carregando gastos...</strong></div>`;

migrateLocalExpenses().catch((error) => {
  console.error(error);
  alert("Nao foi possivel migrar os gastos antigos do aparelho.");
});

observeExpenses(
  (expenses) => {
    gastos = expenses;
    renderizar();
  },
  (error) => {
    console.error(error);
    lista.innerHTML = `<div class="gasto-item"><strong>Erro ao carregar o financeiro.</strong><br><small>Confira as regras do Firestore para permitir acesso ao documento proice/main.</small></div>`;
  }
);

valorInput.addEventListener("input", () => {
  valorInput.value = valorInput.value.replace(/[^0-9.,]/g, "");
});

btnSalvar.onclick = async function () {
  const responsavel = responsavelInput.value.trim();
  const descricao = descricaoInput.value.trim();
  const valorTexto = valorInput.value.trim().replace(",", ".");

  if (!responsavel || !descricao || !valorTexto) {
    alert("Preencha todos os campos.");
    return;
  }

  if (!/^\d+([.,]\d+)?$/.test(valorInput.value.trim())) {
    alert("O valor deve conter apenas numeros.");
    return;
  }

  try {
    btnSalvar.disabled = true;
    salvarResponsavel(responsavel);
    salvarDescricao(descricao);
    await addExpense({
      responsible: responsavel,
      description: descricao,
      amount: Number(valorTexto),
    });

    responsavelInput.value = responsavel;
    descricaoInput.value = "";
    valorInput.value = "";
  } catch (error) {
    alert(error.message);
  } finally {
    btnSalvar.disabled = false;
  }
};

function renderizar() {
  lista.innerHTML = "";
  let total = 0;

  gastos.forEach((g) => {
    total += Number(g.amount || g.valor || 0);

    const item = document.createElement("div");
    item.className = "gasto-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(g.description || g.descricao)}</strong><br>
        <small>${escapeHtml(g.responsible || g.responsavel || "Sem responsavel")} - ${escapeHtml(g.data)} - ${escapeHtml(g.hora)}</small><br>
        <strong>${formatCurrency(g.amount || g.valor || 0)}</strong>
      </div>
      <button class="gasto-remove" aria-label="Excluir gasto">X</button>
    `;

    item.querySelector("button").onclick = async () => {
      if (!confirm("Excluir este gasto?")) {
        return;
      }

      try {
        await deleteExpense(g.id);
      } catch (error) {
        alert(error.message);
      }
    };

    lista.appendChild(item);
  });

  if (!gastos.length) {
    lista.innerHTML = `<div class="gasto-item"><strong>Nenhum gasto lancado.</strong></div>`;
  }

  totalSpan.innerText = `Total: ${formatCurrency(total)}`;
}

function getMesAnoAtual() {
  const meses = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const hoje = new Date();
  return `${meses[hoje.getMonth()]} / ${hoje.getFullYear()}`;
}

function gerarPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageW = 210;
  const pageH = 297;
  const marginX = 10;
  const headerH = 24;
  const tableY = 32;
  const tableHeaderH = 8;
  const totalH = 13;
  const bottomMargin = 8;
  const colData = 58;
  const colValor = 34;
  const colX = [marginX, marginX + colData, pageW - marginX - colValor, pageW - marginX];
  const descW = colX[2] - colX[1] - 4;
  const availableRowsH = pageH - tableY - tableHeaderH - totalH - bottomMargin;
  const rowH = Math.max(3.8, Math.min(8, availableRowsH / Math.max(gastos.length, 1)));
  const fontSize = Math.max(4.8, Math.min(8, rowH * 0.72));
  const lineY = rowH < 5 ? rowH - 1.1 : rowH / 2 + fontSize * 0.22;

  doc.setFillColor(11, 90, 162);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setTextColor(255);
  doc.setFontSize(12);
  doc.text("PROICE CLIMATIZACAO", 14, 13);
  doc.setFontSize(9);
  doc.text(`Relatorio de Gastos - ${getMesAnoAtual()}`, 14, 19);

  doc.setTextColor(0);
  let y = tableY;

  doc.setFillColor(235, 235, 235);
  doc.rect(marginX, y - 5, pageW - marginX * 2, tableHeaderH, "F");
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.15);
  doc.rect(marginX, y - 5, pageW - marginX * 2, tableHeaderH);
  doc.line(colX[1], y - 5, colX[1], y - 5 + tableHeaderH);
  doc.line(colX[2], y - 5, colX[2], y - 5 + tableHeaderH);

  doc.setFontSize(7.2);
  doc.setFont("helvetica", "bold");
  doc.text("DATA / HORA", marginX + 3, y);
  doc.text("DESCRICAO", colX[1] + 3, y);
  doc.text("VALOR", colX[3] - 3, y, { align: "right" });

  y += tableHeaderH;
  let total = 0;

  gastos.forEach((g) => {
    const desc = String(g.description || g.descricao || "");
    const amount = Number(g.amount || g.valor || 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const descFonte = Math.max(2.8, Math.min(fontSize, fontSize * (descW / Math.max(descW, doc.getTextWidth(desc)))));

    doc.setDrawColor(234, 234, 234);
    doc.rect(marginX, y - 4.3, pageW - marginX * 2, rowH);
    doc.line(colX[1], y - 4.3, colX[1], y - 4.3 + rowH);
    doc.line(colX[2], y - 4.3, colX[2], y - 4.3 + rowH);
    doc.setFontSize(fontSize);
    doc.text(`${g.data} ${g.hora}`, marginX + 3, y - 4.3 + lineY);
    doc.setFontSize(descFonte);
    doc.text(desc, colX[1] + 3, y - 4.3 + lineY);
    doc.setFontSize(fontSize);
    doc.text(formatCurrency(amount), colX[3] - 3, y - 4.3 + lineY, { align: "right" });
    total += amount;
    y += rowH;
  });

  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, y - 4.3, pageW - marginX * 2, totalH, "F");
  doc.setDrawColor(220, 220, 220);
  doc.rect(marginX, y - 4.3, pageW - marginX * 2, totalH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL:", colX[2] - 4, y + 4, { align: "right" });
  doc.text(formatCurrency(total), colX[3] - 3, y + 4, { align: "right" });

  return doc;
}

btnPdf.onclick = async function () {
  if (gastos.length === 0) {
    alert("Nao ha gastos para gerar PDF.");
    return;
  }

  const doc = gerarPdf();

  if (navigator.canShare) {
    const blob = doc.output("blob");
    const file = new File([blob], "proice-gastos.pdf", { type: "application/pdf" });

    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Relatorio de Gastos",
        text: "Relatorio de gastos - Proice Climatizacao"
      });
      return;
    }
  }

  const textoWhatsApp = encodeURIComponent("Relatorio de gastos - Proice Climatizacao. O PDF foi gerado no aplicativo.");
  window.open(`https://wa.me/?text=${textoWhatsApp}`, "_blank");
  window.open(doc.output("bloburl"), "_blank");
};

function salvarDescricao(descricao) {
  const jaExiste = historicoDescricoes.some((item) => item.toLowerCase() === descricao.toLowerCase());

  if (!jaExiste) {
    historicoDescricoes.unshift(descricao);
    historicoDescricoes = historicoDescricoes.slice(0, 80);
    localStorage.setItem("historicoDescricoes", JSON.stringify(historicoDescricoes));
    renderizarDescricoesSalvas();
  }
}

function renderizarDescricoesSalvas() {
  descricoesSalvas.innerHTML = "";

  historicoDescricoes.forEach((descricao) => {
    const opcao = document.createElement("option");
    opcao.value = descricao;
    descricoesSalvas.appendChild(opcao);
  });
}

function salvarResponsavel(responsavel) {
  const jaExiste = historicoResponsaveis.some((item) => item.toLowerCase() === responsavel.toLowerCase());

  if (!jaExiste) {
    historicoResponsaveis.unshift(responsavel);
    historicoResponsaveis = historicoResponsaveis.slice(0, 30);
    localStorage.setItem("historicoResponsaveis", JSON.stringify(historicoResponsaveis));
    renderizarResponsaveisSalvos();
  }
}

function renderizarResponsaveisSalvos() {
  responsaveisSalvos.innerHTML = "";

  historicoResponsaveis.forEach((responsavel) => {
    const opcao = document.createElement("option");
    opcao.value = responsavel;
    responsaveisSalvos.appendChild(opcao);
  });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
