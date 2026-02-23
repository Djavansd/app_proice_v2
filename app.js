window.onload = function () {
  const descricaoInput = document.getElementById("descricao");
  const valorInput = document.getElementById("valor");
  const lista = document.getElementById("lista");
  const btnSalvar = document.getElementById("btnSalvar");
  const btnPdf = document.getElementById("btnPdf");
  const totalSpan = document.getElementById("total");
  const CHAVE_RASCUNHO_GASTO = "rascunhoGastoProice";

  let gastos = JSON.parse(localStorage.getItem("gastos")) || [];
  restaurarRascunho();
  renderizar();

  btnSalvar.onclick = function () {
    if (!descricaoInput.value || !valorInput.value) {
      alert("Preencha todos os campos.");
      return;
    }

    const agora = new Date();
    const gasto = {
      descricao: descricaoInput.value,
      valor: Number(valorInput.value),
      data: agora.toLocaleDateString("pt-BR"),
      hora: agora.toLocaleTimeString("pt-BR")
    };

    gastos.push(gasto);
    localStorage.setItem("gastos", JSON.stringify(gastos));

    const rel = JSON.parse(localStorage.getItem("relatorioMensal")) || [];
    rel.push(gasto);
    localStorage.setItem("relatorioMensal", JSON.stringify(rel));

    descricaoInput.value = "";
    valorInput.value = "";
    limparRascunho();
    renderizar();
  };

  function salvarRascunho() {
    const dados = {
      descricao: descricaoInput.value || "",
      valor: valorInput.value || ""
    };
    localStorage.setItem(CHAVE_RASCUNHO_GASTO, JSON.stringify(dados));
  }

  function restaurarRascunho() {
    const rascunho = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO_GASTO) || "null");
    if (!rascunho) return;
    descricaoInput.value = rascunho.descricao || "";
    valorInput.value = rascunho.valor || "";
  }

  function limparRascunho() {
    localStorage.removeItem(CHAVE_RASCUNHO_GASTO);
  }

  descricaoInput.addEventListener("input", salvarRascunho);
  valorInput.addEventListener("input", salvarRascunho);
  window.addEventListener("beforeunload", salvarRascunho);

  function renderizar() {
    lista.innerHTML = "";
    let total = 0;

    gastos.forEach((g, i) => {
      total += g.valor;

      const item = document.createElement("div");
      item.className = "gasto-item";
      item.innerHTML = `
        <div>
          <strong>${g.descricao}</strong><br>
          <small>${g.data} • ${g.hora}</small><br>
          <strong>R$ ${g.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
        </div>
        <button class="gasto-remove" aria-label="Excluir gasto">X</button>
      `;

      item.querySelector("button").onclick = () => {
        gastos.splice(i, 1);
        localStorage.setItem("gastos", JSON.stringify(gastos));
        renderizar();
      };

      lista.appendChild(item);
    });

    totalSpan.innerText =
      "Total: R$ " + total.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
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

    doc.setFillColor(11, 90, 162);
    doc.rect(0, 0, 210, 26, "F");

    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.text("PROICE CLIMATIZACAO", 14, 16);

    doc.setFontSize(9);
    doc.text(`Relatorio de Gastos - ${getMesAnoAtual()}`, 14, 22);

    doc.setTextColor(0);
    let y = 36;

    doc.setFillColor(235, 235, 235);
    doc.rect(12, y - 6, 186, 10, "F");

    doc.setFontSize(9);
    doc.text("DATA / HORA", 16, y);
    doc.text("DESCRICAO", 80, y);
    doc.text("VALOR", 190, y, { align: "right" });

    y += 12;
    let total = 0;

    gastos.forEach(g => {
      doc.setFontSize(8);
      doc.text(`${g.data} ${g.hora}`, 16, y);
      doc.text(g.descricao, 80, y);
      doc.text(
        "R$ " + g.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        190, y, { align: "right" }
      );
      total += g.valor;
      y += 10;
    });

    y += 6;
    doc.line(12, y, 198, y);

    doc.setFontSize(11);
    doc.text("TOTAL:", 150, y + 9);
    doc.text(
      "R$ " + total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      190, y + 9, { align: "right" }
    );

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

    window.open(doc.output("bloburl"), "_blank");
  };
};
