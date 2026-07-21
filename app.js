document.addEventListener("DOMContentLoaded", () => {
  const selettoreFile = document.getElementById("selettoreFile");
  const messaggio = document.getElementById("messaggio");
  const nuovaFattura = document.getElementById("nuovaFattura");
  const archivioBtn = document.getElementById("archivio");

  let fatture = caricaFatture();

  aggiornaTotali();

  nuovaFattura.addEventListener("click", () => {
    selettoreFile.click();
  });
  archivioBtn.addEventListener("click", () => {
  mostraArchivio();
});

  selettoreFile.addEventListener("change", async () => {
    const file = selettoreFile.files[0];

    if (!file) return;

    const nomeFile = file.name.toLowerCase();

    if (
      file.type.startsWith("image/") ||
      nomeFile.endsWith(".jpg") ||
      nomeFile.endsWith(".jpeg") ||
      nomeFile.endsWith(".png")
    ) {
      await leggiImmagine(file);
    } else if (nomeFile.endsWith(".xml")) {
      await leggiXml(file);
    } else if (nomeFile.endsWith(".pdf")) {
      mostraMessaggio(`
        <h3>PDF riconosciuto</h3>
        <p>La lettura automatica dei PDF sarà aggiunta dopo gli screenshot.</p>
      `);
    } else if (nomeFile.endsWith(".p7m")) {
      mostraMessaggio(`
        <h3>File P7M riconosciuto</h3>
        <p>La lettura dei file firmati sarà aggiunta successivamente.</p>
      `);
    } else {
      mostraMessaggio(`
        <h3>File non supportato</h3>
        <p>Seleziona XML, PDF, P7M, JPG, JPEG oppure PNG.</p>
      `);
    }

    selettoreFile.value = "";
  });

  async function leggiImmagine(file) {
    if (typeof Tesseract === "undefined") {
      mostraMessaggio(`
        <h3>Errore OCR</h3>
        <p>Il motore di lettura non è stato caricato.</p>
        <p>Controlla la connessione Internet e aggiorna la pagina.</p>
      `);

      return;
    }

    mostraMessaggio(`
      <h3>Lettura dello screenshot</h3>
      <p id="statoOcr">Preparazione in corso…</p>
      <progress
        id="progressoOcr"
        value="0"
        max="100"
        style="width:100%;height:22px"
      ></progress>
    `);

    try {
      const risultato = await Tesseract.recognize(file, "ita", {
        logger: aggiornamento => {
          const stato = document.getElementById("statoOcr");
          const progresso = document.getElementById("progressoOcr");

          if (stato && aggiornamento.status) {
            stato.textContent = traduciStato(aggiornamento.status);
          }

          if (
            progresso &&
            typeof aggiornamento.progress === "number"
          ) {
            progresso.value = Math.round(
              aggiornamento.progress * 100
            );
          }
        }
      });

      const testo = risultato.data.text.trim();

      if (!testo) {
        throw new Error(
          "Non è stato trovato testo nello screenshot."
        );
      }

      const dati = estraiDatiDaTesto(testo);

      mostraRevisione(dati, testo);
    } catch (errore) {
      mostraMessaggio(`
        <h3>Screenshot non letto</h3>
        <p>${escapeHtml(errore.message)}</p>
        <p>Prova con uno screenshot più nitido e completo.</p>
      `);
    }
  }

  function estraiDatiDaTesto(testo) {
    const righe = testo
      .split(/\r?\n/)
      .map(riga => riga.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return {
      fornitore: trovaFornitore(righe),
      numero: trovaNumeroFattura(righe),
      data: trovaData(testo),
      totale: trovaTotale(righe, testo)
    };
  }

  function trovaData(testo) {
    const risultati = testo.match(
      /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/g
    );

    if (!risultati || !risultati.length) {
      return "";
    }

    const parti = risultati[0].split(/[\/.\-]/);

    const giorno = parti[0].padStart(2, "0");
    const mese = parti[1].padStart(2, "0");
    const anno = parti[2];

    return `${anno}-${mese}-${giorno}`;
  }

 
 function trovaTotale(righe, testo) {
  for (let i = righe.length - 1; i >= 0; i--) {
    const riga = righe[i];

    // Nelle fatture Amazon l'OCR può leggere il totale finale
    // come 26682 invece di 266,82.
    const numeri = riga.match(/\b\d{3,7}\b/g) || [];

    for (let j = numeri.length - 1; j >= 0; j--) {
      const valore = Number(numeri[j]);

      if (
        valore >= 100 &&
        valore <= 999999 &&
        /termine|pagamento|importo|totale|data/i.test(riga)
      ) {
        return valore / 100;
      }
    }
  }

  const importi = estraiImporti(testo);
  return importi.length ? importi[importi.length - 1] : 0;
}

  function estraiImporti(testo) {
    const risultati =
      testo.match(
        /€?\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|€?\s*\d+[.,]\d{2}|€\s*\d{3,7}/g
      ) || [];

    return risultati
      .map(valore => {
        let pulito = valore
          .replace("€", "")
          .replace(/\s/g, "")
          .trim();

        if (
          !pulito.includes(",") &&
          !pulito.includes(".")
        ) {
          return Number(pulito) / 100;
        }

        if (pulito.includes(",")) {
          pulito = pulito
            .replace(/\./g, "")
            .replace(",", ".");
        }

        return Number(pulito);
      })
      .filter(
        importo =>
          Number.isFinite(importo) &&
          importo > 0 &&
          importo < 1000000
      );
  }

function trovaNumeroFattura(righe) {
  for (const riga of righe) {
    const risultato = riga.match(/\bIT[A-Z0-9]{6,20}\b/i);

    if (risultato) {
      return risultato[0].toUpperCase();
    }
  }

  return "";
}

function trovaFornitore(righe) {
  for (const riga of righe) {
    if (/denominazione/i.test(riga)) {
      let valore = riga
        .replace(/^.*?denominazione\s*:\s*/i, "")
        .trim();

      valore = valore
        .split(/\|\s*denominazione\s*:/i)[0]
        .split(/,\s*sede secondaria/i)[0]
        .trim();

      if (valore) {
        return valore;
      }
    }
  }

  return "";
}

  function mostraRevisione(dati, testoOriginale) {
    mostraMessaggio(`
      <h3>Dati riconosciuti</h3>
      <p>Controllali e correggili prima di salvare.</p>

      <label>
        Fornitore
        <input
          id="ocrFornitore"
          type="text"
          value="${escapeHtml(dati.fornitore)}"
          style="width:100%;padding:12px;margin:5px 0 12px"
        >
      </label>

      <label>
        Numero fattura
        <input
          id="ocrNumero"
          type="text"
          value="${escapeHtml(dati.numero)}"
          style="width:100%;padding:12px;margin:5px 0 12px"
        >
      </label>

      <label>
        Data
        <input
          id="ocrData"
          type="date"
          value="${escapeHtml(dati.data)}"
          style="width:100%;padding:12px;margin:5px 0 12px"
        >
      </label>

      <label>
        Totale
        <input
          id="ocrTotale"
          type="number"
          min="0"
          step="0.01"
          value="${dati.totale || ""}"
          style="width:100%;padding:12px;margin:5px 0 16px"
        >
      </label>

      <button
        id="salvaFatturaOcr"
        class="pulsante principale"
        style="width:100%;justify-content:center"
      >
        Salva fattura
      </button>

      <details style="margin-top:16px">
        <summary>Vedi testo riconosciuto</summary>
        <pre style="white-space:pre-wrap;font-size:13px">${escapeHtml(
          testoOriginale
        )}</pre>
      </details>
    `);

    document
      .getElementById("salvaFatturaOcr")
      .addEventListener("click", salvaFatturaDaOcr);
  }

  function salvaFatturaDaOcr() {
    const fornitore = document
      .getElementById("ocrFornitore")
      .value.trim();

    const numero = document
      .getElementById("ocrNumero")
      .value.trim();

    const data = document
      .getElementById("ocrData")
      .value;

    const totale = Number(
      document.getElementById("ocrTotale").value
    );

    if (!fornitore || !data || !totale) {
      alert("Controlla fornitore, data e totale.");
      return;
    }

    const fattura = {
      id: Date.now(),
      fornitore,
      numero,
      data,
      totale,
      pagata: false,
      inseritaIl: new Date().toISOString()
    };

    if (fatturaDuplicata(fattura)) {
      alert("Questa fattura risulta già presente.");
      return;
    }

    fatture.push(fattura);

    salvaFatture();
    aggiornaTotali();

    mostraMessaggio(`
      <h3>Fattura salvata</h3>
      <p><strong>Fornitore:</strong> ${escapeHtml(
        fattura.fornitore
      )}</p>
      <p><strong>Numero:</strong> ${escapeHtml(
        fattura.numero || "Non indicato"
      )}</p>
      <p><strong>Data:</strong> ${formattaData(
        fattura.data
      )}</p>
      <p><strong>Totale:</strong> ${formattaEuro(
        fattura.totale
      )}</p>
    `);
  }

  async function leggiXml(file) {
    try {
      const testoXml = await file.text();

      const parser = new DOMParser();

      const xml = parser.parseFromString(
        testoXml,
        "application/xml"
      );

      if (xml.querySelector("parsererror")) {
        throw new Error("Il file XML non è valido.");
      }

      const fornitore =
        leggiTag(xml, "Denominazione") ||
        `${leggiTag(xml, "Nome")} ${leggiTag(
          xml,
          "Cognome"
        )}`.trim() ||
        "Fornitore non indicato";

      const fattura = {
        id: Date.now(),
        fornitore,
        numero: leggiTag(xml, "Numero"),
        data: leggiTag(xml, "Data"),
        totale: convertiNumero(
          leggiTag(xml, "ImportoTotaleDocumento") ||
            leggiTag(xml, "ImportoPagamento")
        ),
        pagata: false,
        inseritaIl: new Date().toISOString()
      };

      if (
        !fattura.data ||
        !fattura.totale
      ) {
        throw new Error(
          "Non sono stati trovati data e totale."
        );
      }

      if (fatturaDuplicata(fattura)) {
        throw new Error(
          "Questa fattura risulta già presente."
        );
      }

      fatture.push(fattura);

      salvaFatture();
      aggiornaTotali();

      mostraMessaggio(`
        <h3>Fattura XML salvata</h3>
        <p><strong>Fornitore:</strong> ${escapeHtml(
          fattura.fornitore
        )}</p>
        <p><strong>Numero:</strong> ${escapeHtml(
          fattura.numero || "Non indicato"
        )}</p>
        <p><strong>Data:</strong> ${formattaData(
          fattura.data
        )}</p>
        <p><strong>Totale:</strong> ${formattaEuro(
          fattura.totale
        )}</p>
      `);
    } catch (errore) {
      mostraMessaggio(`
        <h3>Errore XML</h3>
        <p>${escapeHtml(errore.message)}</p>
      `);
    }
  }

  function fatturaDuplicata(fattura) {
    return fatture.some(elemento => {
      const stessoFornitore =
        elemento.fornitore.toLowerCase() ===
        fattura.fornitore.toLowerCase();

      const stessoNumero =
        String(elemento.numero || "").toLowerCase() ===
        String(fattura.numero || "").toLowerCase();

      const stessaData = elemento.data === fattura.data;

      const stessoTotale =
        Number(elemento.totale) === Number(fattura.totale);

      if (fattura.numero) {
        return (
          stessoFornitore &&
          stessoNumero &&
          stessaData
        );
      }

      return (
        stessoFornitore &&
        stessaData &&
        stessoTotale
      );
    });
  }

  function leggiTag(xml, nomeTag) {
    const elementi =
      xml.getElementsByTagNameNS("*", nomeTag);

    return elementi.length
      ? elementi[0].textContent.trim()
      : "";
  }

  function convertiNumero(valore) {
    if (!valore) return 0;

    const pulito = valore
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    return Number(pulito) || 0;
  }

  function caricaFatture() {
    try {
      const archivio = localStorage.getItem(
        "registroFatture"
      );

      return archivio ? JSON.parse(archivio) : [];
    } catch {
      return [];
    }
  }

  function salvaFatture() {
    localStorage.setItem(
      "registroFatture",
      JSON.stringify(fatture)
    );
  }

  function aggiornaTotali() {
    const oggi = new Date();
    const meseCorrente = oggi.getMonth();
    const annoCorrente = oggi.getFullYear();

    const fattureValide = fatture.filter(
      fattura =>
        fattura.data &&
        Number.isFinite(Number(fattura.totale))
    );

    const totaleMese = fattureValide
      .filter(fattura => {
        const data = new Date(
          `${fattura.data}T12:00:00`
        );

        return (
          data.getMonth() === meseCorrente &&
          data.getFullYear() === annoCorrente
        );
      })
      .reduce(
        (somma, fattura) =>
          somma + Number(fattura.totale),
        0
      );

    const totaleAnno = fattureValide
      .filter(fattura => {
        const data = new Date(
          `${fattura.data}T12:00:00`
        );

        return data.getFullYear() === annoCorrente;
      })
      .reduce(
        (somma, fattura) =>
          somma + Number(fattura.totale),
        0
      );

    document.getElementById(
      "numeroFatture"
    ).textContent = fatture.length;

    document.getElementById(
      "numeroDaPagare"
    ).textContent = fatture.filter(
      fattura => !fattura.pagata
    ).length;

    document.getElementById(
      "totaleMese"
    ).textContent = formattaEuro(totaleMese);

    document.getElementById(
      "totaleAnno"
    ).textContent = formattaEuro(totaleAnno);
  }

  function traduciStato(stato) {
    const stati = {
      "loading tesseract core":
        "Caricamento del lettore…",
      "initializing tesseract":
        "Inizializzazione…",
      "loading language traineddata":
        "Caricamento lingua italiana…",
      "initializing api":
        "Preparazione della lettura…",
      "recognizing text":
        "Lettura del testo…"
    };

    return stati[stato] || stato;
  }

  function formattaEuro(importo) {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    }).format(Number(importo) || 0);
  }

  function formattaData(data) {
    if (!data) return "Non indicata";

    return new Date(
      `${data}T12:00:00`
    ).toLocaleDateString("it-IT");
  }

  function mostraMessaggio(contenuto) {
    messaggio.innerHTML = contenuto;
    messaggio.classList.remove("nascosto");

    messaggio.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function escapeHtml(valore) {
    return String(valore || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function mostraArchivio() {
  if (!fatture.length) {
    mostraMessaggio(`
      <h3>Archivio fatture</h3>
      <p>Nessuna fattura salvata.</p>
    `);
    return;
  }

  const elenco = fatture
    .slice()
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .map(fattura => `
      <div style="
        padding:14px 0;
        border-bottom:1px solid #ddd;
      ">
        <strong>${escapeHtml(fattura.fornitore)}</strong><br>

        Numero:
        ${escapeHtml(fattura.numero || "Non indicato")}<br>

        Data:
        ${formattaData(fattura.data)}<br>

        Totale:
        ${formattaEuro(fattura.totale)}<br>

        Stato:
        ${fattura.pagata ? "Pagata" : "Da pagare"}
      </div>
    `)
    .join("");

  mostraMessaggio(`
    <h3>Archivio fatture</h3>
    ${elenco}
  `);
}
});