const lista = document.getElementById("lista");
const totalEl = document.getElementById("total");
const mesEl = document.getElementById("mesRelatorio");
const btnPdf = document.getElementById("btnPdf");
const { deleteExpense, observeExpenses } = window.ProiceFinanceiro;

let dados = [];

mesEl.innerText = `Relatorio Mensal - ${getMesAnoAtual()}`;
lista.innerHTML = `<div class="relatorio-row"><div>Carregando...</div><div></div><div></div><div></div></div>`;

observeExpenses(
  (expenses) => {
    dados = expenses.filter(isMobileExpense);
    renderizar();
  },
  (error) => {
    console.error(error);
    lista.innerHTML = `<div class="relatorio-row"><div>Erro ao carregar</div><div>Confira as regras do Firestore</div><div></div><div></div></div>`;
  }
);

function getMesAnoAtual() {
  const meses = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const hoje = new Date();
  return `${meses[hoje.getMonth()]} / ${hoje.getFullYear()}`;
}

function renderizar() {
  lista.innerHTML = "";
  let total = 0;

  dados.forEach((g) => {
    const amount = Number(g.amount || g.valor || 0);
    total += amount;

    const linha = document.createElement("div");
    linha.className = "relatorio-row";
    linha.innerHTML = `
      <div>${escapeHtml(g.data)} ${escapeHtml(g.hora)}</div>
      <div>${escapeHtml(g.responsible || g.responsavel || "Sem responsavel")} - ${escapeHtml(g.description || g.descricao)}</div>
      <div>${formatCurrency(amount)}</div>
      <div><button class="relatorio-delete">X</button></div>
    `;

    linha.querySelector("button").onclick = async () => {
      if (!confirm("Excluir este lancamento?")) {
        return;
      }

      try {
        await deleteExpense(g.id);
      } catch (error) {
        alert(error.message);
      }
    };

    lista.appendChild(linha);
  });

  if (!dados.length) {
    lista.innerHTML = `<div class="relatorio-row"><div>Nenhum gasto</div><div></div><div></div><div></div></div>`;
  }

  totalEl.innerText = formatCurrency(total);
}

btnPdf.onclick = async () => {
  if (dados.length === 0) {
    alert("Nao ha dados para gerar PDF.");
    return;
  }

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
  const rowH = Math.max(3.8, Math.min(8, availableRowsH / Math.max(dados.length, 1)));
  const fontSize = Math.max(4.8, Math.min(8, rowH * 0.72));
  const lineY = rowH < 5 ? rowH - 1.1 : rowH / 2 + fontSize * 0.22;

  doc.setFillColor(11, 90, 162);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setTextColor(255);
  doc.setFontSize(12);
  doc.text("PROICE CLIMATIZACAO", 14, 13);
  doc.setFontSize(9);
  doc.text(`Relatorio Mensal - ${getMesAnoAtual()}`, 14, 19);

  let y = tableY;
  doc.setTextColor(0);
  doc.setFillColor(235, 235, 235);
  doc.rect(colX[0], y - 5, colX[3] - colX[0], tableHeaderH, "F");
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.15);
  doc.rect(colX[0], y - 5, colX[3] - colX[0], tableHeaderH);
  doc.line(colX[1], y - 5, colX[1], y - 5 + tableHeaderH);
  doc.line(colX[2], y - 5, colX[2], y - 5 + tableHeaderH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("DATA / HORA", colX[0] + 3, y);
  doc.text("DESCRICAO", colX[1] + 3, y);
  doc.text("VALOR", colX[3] - 3, y, { align: "right" });

  y += tableHeaderH;
  let soma = 0;

  dados.forEach((g) => {
    const desc = `${g.responsible || g.responsavel || "Sem responsavel"} - ${g.description || g.descricao || ""}`;
    const amount = Number(g.amount || g.valor || 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const descFonte = Math.max(2.8, Math.min(fontSize, fontSize * (descW / Math.max(descW, doc.getTextWidth(desc)))));

    doc.setDrawColor(234, 234, 234);
    doc.rect(colX[0], y - 4.3, colX[3] - colX[0], rowH);
    doc.line(colX[1], y - 4.3, colX[1], y - 4.3 + rowH);
    doc.line(colX[2], y - 4.3, colX[2], y - 4.3 + rowH);

    doc.setFontSize(fontSize);
    doc.text(`${g.data} ${g.hora}`, colX[0] + 3, y - 4.3 + lineY);
    doc.setFontSize(descFonte);
    doc.text(desc, colX[1] + 3, y - 4.3 + lineY);
    doc.setFontSize(fontSize);
    doc.text(formatCurrency(amount), colX[3] - 3, y - 4.3 + lineY, { align: "right" });

    soma += amount;
    y += rowH;
  });

  doc.setFillColor(248, 250, 252);
  doc.rect(colX[0], y - 4.3, colX[3] - colX[0], totalH, "F");
  doc.setDrawColor(220, 220, 220);
  doc.rect(colX[0], y - 4.3, colX[3] - colX[0], totalH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL:", colX[2] - 4, y + 4, { align: "right" });
  doc.text(formatCurrency(soma), colX[3] - 3, y + 4, { align: "right" });

  if (navigator.canShare) {
    const blob = doc.output("blob");
    const file = new File([blob], `proice-relatorio-${getMesAnoAtual().replace(" / ", "-")}.pdf`, { type: "application/pdf" });

    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Relatorio Mensal",
        text: "Relatorio mensal - Proice Climatizacao"
      });
      return;
    }
  }

  const textoWhatsApp = encodeURIComponent("Relatorio mensal - Proice Climatizacao. O PDF foi gerado no aplicativo.");
  window.open(`https://wa.me/?text=${textoWhatsApp}`, "_blank");
  doc.save(`proice-relatorio-${getMesAnoAtual().replace(" / ", "-")}.pdf`);
};

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

function isMobileExpense(expense) {
  return (
    expense.source === "app_proice_v2" ||
    expense.origem === "app_proice_v2" ||
    expense.category === "App financeiro" ||
    expense.categoria === "App financeiro"
  );
}
