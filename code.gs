// ---------- Code.gs ----------

const MAIN_FOLDER_ID = "17ZWt8DhQAgxaLczSuYMwQL4BSvJAuPA9"; 
const SPREADSHEET_ID = "14trXJtvCZwCi1WhapscjwZizJMqUw22MnWjBmswjjCI"; 

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Panel Invitaciones v3.0 Finanzas")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ----------------- HELPER HOJA ----------------- */
function getSheetSeguro() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Pedidos");
  if (!sheet) sheet = ss.getSheetByName("PEDIDOS");
  if (!sheet) sheet = ss.getSheetByName("pedidos");
  return sheet;
}

/* ----------------- REGISTRAR PEDIDO ----------------- */
function registrarPedido(payload) {
  try {
    const sheet = getSheetSeguro();
    if (!sheet) throw new Error("No se encuentra la hoja 'Pedidos'.");

    const nextCode = generarCodigo(sheet);
    
    // Crear carpeta
    const mainFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);
    const pedidoFolder = mainFolder.createFolder(nextCode + " - " + (payload.nombres || "Cliente"));
    
    // Guardar archivos
    const capturaUrls = guardarArchivos(payload.capturaPagoFiles, pedidoFolder);
    const fotosUrls = guardarArchivos(payload.fotosFiles, pedidoFolder);
    const musicaUrls = guardarArchivos(payload.musicaFiles, pedidoFolder);

    const now = new Date();
    
    // Determinar estado de pago inicial
    // Si el adelanto es igual o mayor al total (y total > 0), se marca pagado autom.
    let estadoPagoInicial = "Pendiente";
    if(payload.monto_total && payload.adelanto) {
      if(parseFloat(payload.adelanto) >= parseFloat(payload.monto_total)) {
        estadoPagoInicial = "Pagado";
      }
    }

    const fila = [
      nextCode,                       
      "'" + formatearFecha(now),
      payload.numero_cliente || "",   
      payload.tematica || "",         
      payload.tematica_otro || "",        
      payload.tipo || "",             
      payload.nombres || "",          
      payload.edad || "",             
      payload.fecha || "",
      payload.hora || "",             
      payload.lugar || "",            
      payload.link_canva || "",       
      capturaUrls.join(", "),          
      payload.musicaLink || musicaUrls.join(", "), 
      fotosUrls.join(", "),            
      payload.padrinos || "",         
      payload.padres || "",           
      payload.observaciones || "",
      payload.monto_total || "",      // Nueva Columna 19
      payload.adelanto || "",         // Columna 20
      payload.fecha_entrega || "",    // Columna 21
      "Pendiente",                    // Columna 22 (Estado Trabajo)
      "Sin entregar",                 // Columna 23 (Boleta)
      estadoPagoInicial,              // Nueva Columna 24 (Estado Pago)
      pedidoFolder.getUrl()           // Columna 25
    ];

    sheet.appendRow(fila);
    return { success: true, code: nextCode };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/* ----------------- OBTENER DATOS ----------------- */
function getPedidos() {
  try {
    const sheet = getSheetSeguro();
    if (!sheet) return [];
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // Ahora leemos 25 columnas
    const data = sheet.getRange(2, 1, lastRow - 1, 25).getDisplayValues();

    return data.map((row, i) => {
      return {
        rowIndex: i + 2,
        'Código': row[0],
        'FechaRegistro': row[1],
        'NumeroCliente': row[2],
        'Tematica': row[3],
        'TematicaOtro': row[4],
        'Tipo': row[5],
        'Nombre': row[6],
        'Edad': row[7],
        'FechaEvento': row[8],
        'HoraEvento': row[9],
        'Lugar': row[10],
        'LinkCanva': row[11],
        'LinkCapturaYape': row[12],
        'LinkMusica': row[13],
        'LinkFotos': row[14],
        'Padrinos': row[15],
        'Padres': row[16],
        'Observaciones': row[17],
        'MontoTotal': row[18],        // Nuevo
        'Adelanto': row[19],
        'FechaEstimadaEntrega': row[20],
        'Estado': row[21],
        'Boleta': row[22], 
        'EstadoPago': row[23],        // Nuevo
        'CarpetaPedido': row[24]
      };
    }).reverse(); 
  } catch (e) {
    return [{ 'Código': 'ERR', 'Nombre': 'Error: ' + e.toString() }];
  }
}

/* ----------------- CAMBIAR ESTADO BOLETA ----------------- */
function cambiarEstadoBoleta(codigo) {
  return toggleEstadoCelda(codigo, 23, "Entregado", "Sin entregar");
}

/* ----------------- CAMBIAR ESTADO PAGO (NUEVO) ----------------- */
function cambiarEstadoPago(codigo) {
  return toggleEstadoCelda(codigo, 24, "Pagado", "Pendiente");
}

// Función genérica para cambiar estados rápido
function toggleEstadoCelda(codigo, colIndex, valTrue, valFalse) {
  try {
    const sheet = getSheetSeguro();
    const data = sheet.getDataRange().getDisplayValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(codigo)) {
        const rowIdx = i + 1;
        const estadoActual = sheet.getRange(rowIdx, colIndex).getValue();
        const nuevoEstado = (estadoActual === valTrue) ? valFalse : valTrue;
        sheet.getRange(rowIdx, colIndex).setValue(nuevoEstado);
        return { success: true, nuevoEstado: nuevoEstado };
      }
    }
    return { success: false, error: "Pedido no encontrado" };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/* ----------------- EDITAR / ACTUALIZAR ----------------- */
function editarPedido(payload) {
  try {
    const sheet = getSheetSeguro();
    const data = sheet.getDataRange().getDisplayValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.codigo)) {
        rowIndex = i + 1; 
        break;
      }
    }
    if (rowIndex === -1) return { success: false, error: "Pedido no encontrado" };

    const carpetaUrl = sheet.getRange(rowIndex, 25).getValue(); // Columna 25 ahora
    const folderId = extractFolderIdFromUrl(carpetaUrl);
    let folder = folderId ? DriveApp.getFolderById(folderId) : null;

    let nuevasFotos = [], nuevosPagos = [], nuevasMusicas = [];
    if (folder) {
      nuevasFotos = guardarArchivos(payload.fotosFiles, folder);
      nuevasPagos = guardarArchivos(payload.capturaPagoFiles, folder);
      nuevasMusicas = guardarArchivos(payload.musicaFiles, folder);
    }

    // Actualizamos columnas según nuevos índices
    const updates = [
      { col: 3, val: payload.numero_cliente },
      { col: 4, val: payload.tematica },
      { col: 5, val: payload.tematica_otro },
      { col: 6, val: payload.tipo },
      { col: 7, val: payload.nombres },
      { col: 8, val: payload.edad },
      { col: 9, val: payload.fecha },
      { col: 10, val: payload.hora },
      { col: 11, val: payload.lugar },
      { col: 12, val: payload.link_canva },
      { col: 16, val: payload.padrinos },
      { col: 17, val: payload.padres },
      { col: 18, val: payload.observaciones },
      { col: 19, val: payload.monto_total }, // Nuevo
      { col: 20, val: payload.adelanto },
      { col: 21, val: payload.fecha_entrega },
      { col: 22, val: payload.estado },
      { col: 24, val: payload.estado_pago }  // Nuevo
    ];

    updates.forEach(u => {
      if (u.val !== undefined) sheet.getRange(rowIndex, u.col).setValue(u.val);
    });

    appendLinks(sheet, rowIndex, 15, nuevasFotos);
    appendLinks(sheet, rowIndex, 13, nuevosPagos);
    
    if (payload.musicaLink) sheet.getRange(rowIndex, 14).setValue(payload.musicaLink); 
    if (nuevasMusicas.length > 0) {
      let cell = sheet.getRange(rowIndex, 14);
      let val = cell.getValue();
      cell.setValue(val ? val + ", " + nuevasMusicas.join(", ") : nuevasMusicas.join(", "));
    }

    return { success: true };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function actualizarEstadoPedido(codigo, nuevoEstado) {
  try {
    const sheet = getSheetSeguro();
    const data = sheet.getDataRange().getDisplayValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(codigo)) {
        sheet.getRange(i + 1, 22).setValue(nuevoEstado); // Columna 22 es Estado
        return { success: true };
      }
    }
    return { success: false, error: "Código no encontrado" };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function eliminarPedido(codigo) {
  try {
    const sheet = getSheetSeguro();
    const data = sheet.getDataRange().getDisplayValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(codigo)) {
        const rowIndex = i + 1;
        try {
          const carpetaUrl = data[i][24]; // Columna 25 (índice 24)
          const folderId = extractFolderIdFromUrl(carpetaUrl);
          if (folderId) { DriveApp.getFolderById(folderId).setTrashed(true); }
        } catch (errDrive) {
          console.log("No se pudo borrar carpeta: " + errDrive);
        }
        sheet.deleteRow(rowIndex);
        return { success: true };
      }
    }
    return { success: false, error: "Código no encontrado para eliminar." };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/* ----------------- FUNCIONES AUXILIARES ----------------- */
function generarCodigo(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "INV-0001";
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let max = 0;
  data.forEach(r => {
    const num = parseInt(String(r[0]).replace("INV-", ""), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return "INV-" + String(max + 1).padStart(4, "0");
}

function guardarArchivos(files, folder) {
  if (!files || files.length === 0) return [];
  return files.map(f => {
    try {
      const blob = Utilities.newBlob(Utilities.base64Decode(f.base64.split(',')[1]), f.type, f.name);
      return folder.createFile(blob).getUrl();
    } catch (e) { return "Error"; }
  });
}

function formatearFecha(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
}

function extractFolderIdFromUrl(url) {
  if (!url) return null;
  let m = url.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function appendLinks(sheet, row, col, newLinks) {
  if (!newLinks || newLinks.length === 0) return;
  const cell = sheet.getRange(row, col);
  const current = cell.getValue();
  const val = current ? (current + ", " + newLinks.join(", ")) : newLinks.join(", ");
  cell.setValue(val);
}
