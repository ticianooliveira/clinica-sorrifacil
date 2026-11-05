const STORAGE_KEY = "acompanhamentoClinicoV1";
const DB_NAME = "AcompanhamentoClinicoArquivos";
const DB_STORE = "arquivos";
let selectedPatientId = null;
let state = loadState();
let attachmentCache = [];
let viewerObjectUrl = null;
let previewedReport = null;

// Não dependa de IDs virarem variáveis globais. Chromium costuma aceitar
// esse atalho, mas o Firefox não o garante, principalmente em páginas file://.
const byId = id => document.getElementById(id);
const patientModal = byId("patientModal");
const patientRecord = byId("patientRecord");
const patientName = byId("patientName");
const patientPhone = byId("patientPhone");
const patientPriority = byId("patientPriority");
const patientStatus = byId("patientStatus");
const patientPreviousProfessional = byId("patientPreviousProfessional");
const patientNextStep = byId("patientNextStep");
const patientNotes = byId("patientNotes");
const patientLink = byId("patientLink");
const patientId = byId("patientId");
const evolutionModal = byId("evolutionModal");
const evolutionForm = byId("evolutionForm");
const evolutionPatientId = byId("evolutionPatientId");
const evolutionId = byId("evolutionId");
const evolutionModalTitle = byId("evolutionModalTitle");
const evolutionSubmitButton = byId("evolutionSubmitButton");
const evolutionDate = byId("evolutionDate");
const evolutionProfessional = byId("evolutionProfessional");
const evolutionDone = byId("evolutionDone");
const evolutionRequest = byId("evolutionRequest");
const evolutionPending = byId("evolutionPending");
const evolutionNotes = byId("evolutionNotes");
const evolutionStatus = byId("evolutionStatus");
const evolutionNextStep = byId("evolutionNextStep");
const fileModal = byId("fileModal");
const fileForm = byId("fileForm");
const filePatientId = byId("filePatientId");
const fileDate = byId("fileDate");
const fileDescription = byId("fileDescription");
const fileInput = byId("fileInput");
const viewerModal = byId("viewerModal");
const viewerTitle = byId("viewerTitle");
const viewerToolbar = byId("viewerToolbar");
const viewerContent = byId("viewerContent");
const viewerZoomLabel = byId("viewerZoomLabel");

// Registros clínicos permanecem no navegador e nas cópias de segurança.
const initialPatients = [];

function patient(record,name,status,priority,nextStep,evolutions,notes="") {
  return {id:cryptoId(),record,name,status,priority,nextStep,evolutions,notes,phone:"",previousProfessional:"",link:""};
}
function evolution(date,done,request,pending,notes="",professional="") {
  return {id:cryptoId(),date,done,request,pending,notes,professional};
}
function cryptoId() {
  return (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.patients)) return saved;
  } catch (_) {}
  return {patients:[]};
}
function initialize() {
  if (!state.patients.length) {
    state.patients = initialPatients;
    persist();
  }
  bindNavigation();
  renderAll();
  refreshAttachments();
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    alert("O navegador bloqueou o armazenamento local. No Firefox, abra fora da navegação privativa e permita que o site salve dados.\n\n" + error.message);
  }
  renderAll();
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}
function bindNavigation() {
  document.querySelectorAll(".nav button").forEach(btn => btn.addEventListener("click", () => {
    showView(btn.dataset.view);
    document.getElementById("sidebar").classList.remove("open");
  }));
}
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById("view-"+name);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.view===name));
  if (name==="files") refreshAttachments();
  window.scrollTo({top:0,behavior:"smooth"});
}
function toggleMenu() { document.getElementById("sidebar").classList.toggle("open"); }
function renderAll() {
  renderMetrics(); renderDashboardTable(); renderPatients(); renderRequests();
  if (selectedPatientId) renderPatientDetail(selectedPatientId);
}
function lastEvolution(p) {
  return [...(p.evolutions||[])].sort((a,b)=>b.date.localeCompare(a.date))[0] || null;
}
function renderMetrics() {
  const all = state.patients;
  const items = [
    ["Pacientes acompanhados",all.length,""],
    ["Aguardando materiais",all.filter(p=>p.status==="Aguardando material").length,"warning"],
    ["Casos prioritários",all.filter(p=>p.priority==="Alta" && p.status!=="Tratamento concluído").length,"danger"],
    ["Concluídos",all.filter(p=>p.status==="Tratamento concluído").length,"success"]
  ];
  document.getElementById("metrics").innerHTML = items.map(x=>`<div class="metric ${x[2]}"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");
}
function filteredPatients(searchId,filterId) {
  const q=(document.getElementById(searchId)?.value||"").trim().toLocaleLowerCase("pt-BR");
  const f=document.getElementById(filterId)?.value||"";
  return [...state.patients].filter(p=>(!q || `${p.name} ${p.record}`.toLocaleLowerCase("pt-BR").includes(q)) && (!f || p.status===f))
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
function renderDashboardTable() {
  const el=document.getElementById("dashboardBody"); if(!el)return;
  const rows=filteredPatients("dashboardSearch","dashboardFilter");
  el.innerHTML=rows.length?rows.map(p=>{
    const last=lastEvolution(p);
    return `<tr><td><button class="patient-link" onclick="openPatient('${p.id}')">${esc(p.record)} · ${esc(p.name)}</button></td>
      <td>${statusBadge(p.status)}</td><td>${last?formatDate(last.date):"—"}</td><td>${esc(p.nextStep||"Não informada")}</td><td>${priorityBadge(p.priority)}</td></tr>`;
  }).join(""):`<tr><td colspan="5" class="empty">Nenhum paciente encontrado.</td></tr>`;
}
function renderPatients() {
  const el=document.getElementById("patientsBody"); if(!el)return;
  const rows=filteredPatients("patientSearch","patientFilter");
  el.innerHTML=rows.length?rows.map(p=>{
    const last=lastEvolution(p);
    return `<tr><td>${esc(p.record)}</td><td><button class="patient-link" onclick="openPatient('${p.id}')">${esc(p.name)}</button></td>
      <td>${statusBadge(p.status)}</td><td>${last?formatDate(last.date):"—"}</td><td>${priorityBadge(p.priority)}</td>
      <td><button class="btn small" onclick="openPatient('${p.id}')">Abrir ficha</button></td></tr>`;
  }).join(""):`<tr><td colspan="6" class="empty">Nenhum paciente encontrado.</td></tr>`;
}
function renderRequests() {
  const el=document.getElementById("requestsGrid"); if(!el)return;
  const rows=state.patients.map(p=>({p,e:lastEvolution(p)})).filter(x=>x.e?.request?.trim());
  el.innerHTML=rows.length?rows.map(({p,e})=>`<article class="simple-card">
    <h3>${esc(p.record)} · ${esc(p.name)}</h3><p>${statusBadge(p.status)} ${priorityBadge(p.priority)}</p>
    <p style="white-space:pre-line;color:var(--text)">${esc(e.request)}</p>
    <button class="btn small" onclick="openPatient('${p.id}')">Abrir ficha</button>
  </article>`).join(""):`<div class="empty">Nenhuma solicitação registrada.</div>`;
}
function statusBadge(status) {
  let c=status==="Tratamento concluído"?"status-done":status==="Prontuário incompleto"?"status-incomplete":status==="Encaminhado"?"status-forwarded":status?.startsWith("Aguardando")?"status-waiting":"status-progress";
  return `<span class="badge ${c}">${esc(status||"Não informado")}</span>`;
}
function priorityBadge(priority) {
  const c=priority==="Alta"?"priority-high":priority==="Baixa"?"priority-low":"priority-medium";
  return `<span class="badge ${c}">${esc(priority||"Média")}</span>`;
}
function openPatient(id) {
  selectedPatientId=id; renderPatientDetail(id); showView("patient-detail");
}
function renderPatientDetail(id) {
  const p=state.patients.find(x=>x.id===id); if(!p)return;
  const evolutions=[...(p.evolutions||[])].sort((a,b)=>b.date.localeCompare(a.date));
  document.getElementById("patientDetail").innerHTML=`
    <div class="patient-header">
      <div><h2>${esc(p.name)}</h2><p>Ficha nº ${esc(p.record)} ${p.phone?" · "+esc(p.phone):""}</p><p>${statusBadge(p.status)} ${priorityBadge(p.priority)}</p></div>
      <div class="actions"><button class="btn" onclick="openPatientModal('${p.id}')">Editar</button><button class="btn" onclick="exportPatientWord('${p.id}')">Relatório Word</button></div>
    </div>
    <div class="tabs">
      <button class="active" onclick="switchTab(event,'history')">Evoluções</button>
      <button onclick="switchTab(event,'attachments')">Arquivos</button>
      <button onclick="switchTab(event,'data')">Dados gerais</button>
    </div>
    <div class="tab-pane active" id="tab-history">
      <div class="actions" style="margin-bottom:13px"><button class="btn primary" onclick="openEvolutionModal('${p.id}')">＋ Nova evolução</button></div>
      <div class="timeline">${evolutions.length?evolutions.map(e=>`
        <article class="event"><div class="event-head"><strong>${formatDate(e.date)}</strong><div class="actions"><button class="btn small" onclick="openEvolutionModal('${p.id}','${e.id}')">Editar</button><button class="btn small danger" onclick="deleteEvolution('${p.id}','${e.id}')">Excluir</button></div></div>
          <div class="event-grid"><div><h4>O que foi feito</h4><p>${esc(e.done||"—")}</p></div><div><h4>O que solicitar</h4><p>${esc(e.request||"—")}</p></div><div><h4>O que falta fazer</h4><p>${esc(e.pending||"—")}</p></div></div>
          ${(e.notes||e.professional)?`<p class="muted" style="margin:12px 0 0">${e.professional?"Profissional/encaminhamento: "+esc(e.professional)+" · ":""}${esc(e.notes||"")}</p>`:""}
        </article>`).join(""):`<div class="empty">Nenhuma evolução registrada.</div>`}</div>
    </div>
    <div class="tab-pane" id="tab-attachments">
      <div class="actions" style="margin-bottom:13px"><button class="btn primary" onclick="openFileModal('${p.id}')">＋ Adicionar arquivo</button></div>
      <div class="files-grid" id="patientFilesGrid"></div>
    </div>
    <div class="tab-pane" id="tab-data">
      <section class="panel"><div class="modal-body">
        <div class="form-grid">
          <div><label>Situação atual</label><div>${statusBadge(p.status)}</div></div>
          <div><label>Próxima etapa</label><div>${esc(p.nextStep||"Não informada")}</div></div>
          <div><label>Profissional anterior</label><div>${esc(p.previousProfessional||"Não informado")}</div></div>
          <div><label>Telefone</label><div>${esc(p.phone||"Não informado")}</div></div>
          <div class="field full"><label>Observações gerais</label><div>${esc(p.notes||"Sem observações")}</div></div>
          <div class="field full"><label>Prontuário digital</label><div>${p.link?`<a href="${attr(p.link)}" target="_blank" rel="noopener">Abrir prontuário</a>`:"Não informado"}</div></div>
        </div>
        <div class="actions" style="margin-top:18px"><button class="btn danger" onclick="deletePatient('${p.id}')">Excluir paciente</button></div>
      </div></section>
    </div>`;
  renderPatientFiles(id);
}
function switchTab(ev,name) {
  ev.currentTarget.parentElement.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
  ev.currentTarget.classList.add("active");
  document.querySelectorAll(".tab-pane").forEach(p=>p.classList.remove("active"));
  document.getElementById("tab-"+name).classList.add("active");
  if(name==="attachments") renderPatientFiles(selectedPatientId);
}
function openPatientModal(id="") {
  document.getElementById("patientForm").reset();
  document.getElementById("patientId").value=id;
  document.getElementById("patientModalTitle").textContent=id?"Editar paciente":"Novo paciente";
  if(id) {
    const p=state.patients.find(x=>x.id===id); if(!p)return;
    patientRecord.value=p.record||""; patientName.value=p.name||""; patientPhone.value=p.phone||"";
    patientPriority.value=p.priority||"Média"; patientStatus.value=p.status||"Aguardando avaliação";
    patientPreviousProfessional.value=p.previousProfessional||""; patientNextStep.value=p.nextStep||"";
    patientNotes.value=p.notes||""; patientLink.value=p.link||"";
  } else {
    patientPriority.value="Média"; patientStatus.value="Aguardando avaliação";
  }
  openDialog(patientModal);
}
function savePatient(ev) {
  ev.preventDefault();
  const id=patientId.value;
  const data={record:patientRecord.value.trim(),name:patientName.value.trim(),phone:patientPhone.value.trim(),
    priority:patientPriority.value,status:patientStatus.value,previousProfessional:patientPreviousProfessional.value.trim(),
    nextStep:patientNextStep.value.trim(),notes:patientNotes.value.trim(),link:patientLink.value.trim()};
  if(id) Object.assign(state.patients.find(x=>x.id===id),data);
  else state.patients.push({...data,id:cryptoId(),evolutions:[]});
  persist(); closeDialog("patientModal"); toast("Paciente salvo com sucesso.");
}
function openEvolutionModal(patientId,evolutionToEditId="") {
  evolutionForm.reset();
  evolutionPatientId.value=patientId;
  evolutionId.value=evolutionToEditId;
  const p=state.patients.find(x=>x.id===patientId); if(!p)return;
  evolutionStatus.value=p.status;
  evolutionNextStep.value=p.nextStep||"";
  if(evolutionToEditId) {
    const savedEvolution=(p.evolutions||[]).find(e=>e.id===evolutionToEditId); if(!savedEvolution)return;
    evolutionModalTitle.textContent="Editar evolução";
    evolutionSubmitButton.textContent="Salvar alterações";
    evolutionDate.value=savedEvolution.date||todayISO();
    evolutionProfessional.value=savedEvolution.professional||"";
    evolutionDone.value=savedEvolution.done||"";
    evolutionRequest.value=savedEvolution.request||"";
    evolutionPending.value=savedEvolution.pending||"";
    evolutionNotes.value=savedEvolution.notes||"";
  } else {
    evolutionModalTitle.textContent="Nova evolução";
    evolutionSubmitButton.textContent="Salvar evolução";
    evolutionDate.value=todayISO();
  }
  openDialog(evolutionModal);
}
function saveEvolution(ev) {
  ev.preventDefault();
  const p=state.patients.find(x=>x.id===evolutionPatientId.value); if(!p)return;
  const data={date:evolutionDate.value,done:evolutionDone.value.trim(),request:evolutionRequest.value.trim(),
    pending:evolutionPending.value.trim(),notes:evolutionNotes.value.trim(),professional:evolutionProfessional.value.trim()};
  const savedEvolutionId=evolutionId.value;
  if(savedEvolutionId) {
    const savedEvolution=(p.evolutions||[]).find(e=>e.id===savedEvolutionId); if(!savedEvolution)return;
    Object.assign(savedEvolution,data);
  } else {
    p.evolutions.push({id:cryptoId(),...data});
  }
  p.status=evolutionStatus.value; p.nextStep=evolutionNextStep.value.trim();
  persist(); closeDialog("evolutionModal"); toast(savedEvolutionId?"Evolução atualizada.":"Evolução adicionada.");
}
function deleteEvolution(patientId,evolutionId) {
  if(!confirm("Excluir esta evolução?"))return;
  const p=state.patients.find(x=>x.id===patientId); p.evolutions=p.evolutions.filter(e=>e.id!==evolutionId);
  persist(); toast("Evolução excluída.");
}
async function deletePatient(id) {
  const p=state.patients.find(x=>x.id===id);
  if(!confirm(`Excluir definitivamente a ficha de ${p.name} e seus anexos?`))return;
  const files=await dbGetAll(); for(const f of files.filter(x=>x.patientId===id)) await dbDelete(f.id);
  state.patients=state.patients.filter(x=>x.id!==id); selectedPatientId=null; persist(); showView("patients"); refreshAttachments(); toast("Paciente excluído.");
}
function openFileModal(id) {
  fileForm.reset(); filePatientId.value=id; fileDate.value=todayISO(); openDialog(fileModal);
}
async function saveAttachment(ev) {
  ev.preventDefault();
  const files=[...fileInput.files]; if(!files.length)return;
  try {
    const commonDescription=fileDescription.value.trim();
    for(const file of files) {
      await dbPut({id:cryptoId(),patientId:filePatientId.value,date:fileDate.value,description:commonDescription||file.name,name:file.name,type:file.type||"application/octet-stream",size:file.size,blob:file});
    }
    closeDialog("fileModal"); await refreshAttachments(); renderPatientFiles(filePatientId.value);
    toast(files.length===1?"Arquivo anexado.":`${files.length} arquivos anexados.`);
  } catch(err) { alert("Não foi possível guardar o arquivo. O navegador pode estar sem espaço disponível.\\n\\n"+err.message); }
}
function openDb() {
  return new Promise((resolve,reject)=>{
    if (!self.indexedDB) {
      reject(new Error("O armazenamento de anexos não está disponível neste navegador."));
      return;
    }
    let req;
    try { req=indexedDB.open(DB_NAME,1); }
    catch (error) { reject(error); return; }
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE,{keyPath:"id"}); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function dbPut(item) { const db=await openDb(); return txPromise(db.transaction(DB_STORE,"readwrite").objectStore(DB_STORE).put(item)); }
async function dbGetAll() { const db=await openDb(); return txPromise(db.transaction(DB_STORE,"readonly").objectStore(DB_STORE).getAll()); }
async function dbDelete(id) { const db=await openDb(); return txPromise(db.transaction(DB_STORE,"readwrite").objectStore(DB_STORE).delete(id)); }
function txPromise(req) { return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
async function refreshAttachments() {
  try {
    attachmentCache=await dbGetAll();
  } catch (error) {
    attachmentCache=[];
    console.warn("Armazenamento de anexos indisponível:", error);
  }
  renderAllFiles();
  if(selectedPatientId) renderPatientFiles(selectedPatientId);
}
function fileCard(f,showPatient=false) {
  const url=URL.createObjectURL(f.blob);
  const preview=f.type.startsWith("image/")?`<img src="${url}" alt="">`:f.type.startsWith("video/")?`<video src="${url}" controls></video>`:`<span>📄</span>`;
  const p=state.patients.find(x=>x.id===f.patientId);
  return `<article class="file-card"><div class="file-preview">${preview}</div><div class="file-info"><strong title="${attr(f.name)}">${esc(f.description||f.name)}</strong>
    <small>${formatDate(f.date)}${showPatient&&p?" · "+esc(p.name):""}</small><div class="actions" style="margin-top:8px">
    <button class="btn small" onclick="openAttachment('${f.id}')">Abrir</button><button class="btn small danger" onclick="deleteAttachment('${f.id}')">Excluir</button></div></div></article>`;
}
function renderPatientFiles(id) {
  const el=document.getElementById("patientFilesGrid"); if(!el)return;
  const files=attachmentCache.filter(x=>x.patientId===id).sort((a,b)=>b.date.localeCompare(a.date));
  el.innerHTML=files.length?files.map(f=>fileCard(f)).join(""):`<div class="empty">Nenhum arquivo anexado.</div>`;
}
function renderAllFiles() {
  const el=document.getElementById("allFilesGrid"); if(!el)return;
  const files=[...attachmentCache].sort((a,b)=>b.date.localeCompare(a.date));
  el.innerHTML=files.length?files.map(f=>fileCard(f,true)).join(""):`<div class="empty">Nenhum arquivo anexado.</div>`;
}
function openAttachment(id) {
  const f=attachmentCache.find(x=>x.id===id); if(!f)return;
  closeAttachmentViewer();
  viewerTitle.textContent=f.description||f.name;
  viewerObjectUrl=URL.createObjectURL(f.blob);
  if(f.type.startsWith("image/")) {
    viewerToolbar.classList.add("visible");
    viewerContent.innerHTML=`<img id="viewerImage" src="${viewerObjectUrl}" alt="${attr(f.description||f.name)}">`;
    document.getElementById("viewerImage").onload=fitViewerImage;
  } else if(f.type.startsWith("video/")) {
    viewerContent.innerHTML=`<video src="${viewerObjectUrl}" controls autoplay></video>`;
  } else if(f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf")) {
    viewerContent.innerHTML=`<iframe src="${viewerObjectUrl}" title="${attr(f.description||f.name)}"></iframe>`;
  } else {
    viewerContent.innerHTML=`<div class="viewer-unavailable"><h3>Visualização não disponível</h3><p>Este tipo de documento não pode ser exibido diretamente pelo navegador.</p><button class="btn" onclick="downloadAttachment('${f.id}')">Baixar para abrir</button></div>`;
  }
  openDialog(viewerModal);
}
let viewerImageZoom=1;
function setImageZoom(zoom) {
  const image=document.getElementById("viewerImage"); if(!image)return;
  viewerImageZoom=Math.min(5,Math.max(.1,zoom));
  image.style.width=`${Math.round(image.naturalWidth*viewerImageZoom)}px`;
  image.style.height=`${Math.round(image.naturalHeight*viewerImageZoom)}px`;
  viewerZoomLabel.textContent=`${Math.round(viewerImageZoom*100)}%`;
}
function changeImageZoom(amount) { setImageZoom(viewerImageZoom+amount); }
function fitViewerImage() {
  const image=document.getElementById("viewerImage"); if(!image||!image.naturalWidth)return;
  const body=viewerModal.querySelector(".modal-body");
  const availableWidth=Math.max(100,body.clientWidth-28);
  const availableHeight=Math.max(100,body.clientHeight-28);
  setImageZoom(Math.min(1,availableWidth/image.naturalWidth,availableHeight/image.naturalHeight));
  body.scrollTo({left:0,top:0});
}
viewerContent.addEventListener("wheel",event=>{
  if(!event.ctrlKey||!document.getElementById("viewerImage"))return;
  event.preventDefault();
  changeImageZoom(event.deltaY<0?.1:-.1);
},{passive:false});
function closeAttachmentViewer() {
  const video=viewerContent.querySelector("video"); if(video)video.pause();
  viewerContent.innerHTML="";
  viewerToolbar.classList.remove("visible");
  viewerImageZoom=1;
  viewerZoomLabel.textContent="100%";
  if(viewerObjectUrl){URL.revokeObjectURL(viewerObjectUrl);viewerObjectUrl=null;}
}
function downloadAttachment(id) {
  const f=attachmentCache.find(x=>x.id===id); if(!f)return;
  const a=document.createElement("a"); a.href=URL.createObjectURL(f.blob); a.download=f.name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function deleteAttachment(id) {
  if(!confirm("Excluir este arquivo?"))return;
  await dbDelete(id); await refreshAttachments(); toast("Arquivo excluído.");
}
async function downloadBackup() {
  const files=await dbGetAll();
  const packed=[];
  for(const f of files) packed.push({...f,blob:await blobToDataURL(f.blob)});
  downloadBlob(new Blob([JSON.stringify({version:1,createdAt:new Date().toISOString(),state,files:packed},null,2)],{type:"application/json"}),`backup-acompanhamento-${todayISO()}.json`);
  toast("Cópia de segurança criada.");
}
async function restoreBackup(ev) {
  const file=ev.target.files[0]; if(!file)return;
  if(!confirm("A restauração substituirá os dados atuais. Deseja continuar?")){ev.target.value="";return;}
  try {
    const data=JSON.parse(await file.text());
    if(!data.state?.patients) throw new Error("Arquivo de cópia inválido.");
    const db=await openDb(); await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readwrite");tx.objectStore(DB_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    for(const f of (data.files||[])) await dbPut({...f,blob:dataURLToBlob(f.blob)});
    state=data.state; persist(); await refreshAttachments(); toast("Cópia restaurada com sucesso.");
  } catch(err) { alert("Não foi possível restaurar: "+err.message); }
  ev.target.value="";
}
function blobToDataURL(blob) { return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);}); }
function dataURLToBlob(data) {
  const [meta,b64]=data.split(","); const mime=(meta.match(/:(.*?);/)||[])[1]||"application/octet-stream";
  const bytes=atob(b64), arr=new Uint8Array(bytes.length); for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i); return new Blob([arr],{type:mime});
}
function exportGeneralWord() {
  const body=state.patients.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=>patientWordSection(p)).join("");
  downloadWord("Relatório geral de acompanhamento clínico",body,"relatorio-geral-acompanhamento.doc");
}
function exportPatientWord(id) {
  const p=state.patients.find(x=>x.id===id); downloadWord(`Relatório individual – ${p.name}`,patientWordSection(p),`relatorio-${safeName(p.name)}.doc`);
}
function exportMaterialsWord() {
  const rows=state.patients.map(p=>({p,e:lastEvolution(p)})).filter(x=>x.e?.request?.trim()).map(({p,e})=>
    `<tr><td>${html(p.record)}</td><td>${html(p.name)}</td><td>${htmlLines(e.request)}</td><td>${html(p.status)}</td><td>${html(p.priority)}</td></tr>`).join("");
  downloadWord("Materiais, componentes e exames solicitados",`<table><thead><tr><th>Ficha</th><th>Paciente</th><th>Solicitação</th><th>Situação</th><th>Prioridade</th></tr></thead><tbody>${rows}</tbody></table>`,"relatorio-materiais-solicitacoes.doc");
}
function exportIncompleteWord() {
  const list=state.patients.filter(p=>p.status==="Prontuário incompleto" || /ficha|anotaç|confirm/i.test(`${p.notes} ${lastEvolution(p)?.request||""}`));
  const body=list.map(p=>patientWordSection(p)).join("")||"<p>Nenhum prontuário incompleto registrado.</p>";
  downloadWord("Prontuários incompletos e informações a confirmar",body,"relatorio-prontuarios-incompletos.doc");
}
function patientWordSection(p) {
  const evs=[...(p.evolutions||[])].sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<tr><td>${html(formatDate(e.date))}</td><td>${htmlLines(e.done)}</td><td>${htmlLines(e.request)}</td><td>${htmlLines(e.pending)}</td></tr>`).join("");
  return `<h2>${html(p.record)} – ${html(p.name)}</h2><p><b>Situação:</b> ${html(p.status)} &nbsp; <b>Prioridade:</b> ${html(p.priority)}</p>
    <p><b>Próxima etapa:</b> ${html(p.nextStep||"Não informada")}</p>${p.notes?`<p><b>Observações:</b> ${html(p.notes)}</p>`:""}
    <table><thead><tr><th>Data</th><th>O que foi feito</th><th>O que solicitar</th><th>O que falta fazer</th></tr></thead><tbody>${evs}</tbody></table>`;
}
function downloadWord(title,body,filename) {
  const doc=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{size:A4;margin:1.6cm}body{max-width:21cm;margin:0 auto;padding:1.6cm;box-sizing:border-box;font-family:Arial,sans-serif;color:#243746;font-size:10.5pt}h1{color:#0f2942;font-size:19pt;border-bottom:3px solid #11a7a0;padding-bottom:8px}
    h2{color:#0f2942;font-size:13pt;margin-top:22px}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th{background:#0f2942;color:white;text-align:left}
    th,td{border:1px solid #bccbd5;padding:7px;vertical-align:top}p{line-height:1.4}@media print{body{max-width:none;margin:0;padding:0}}</style></head><body>
    <h1>${html(title)}</h1><p>Gerado em ${html(new Date().toLocaleString("pt-BR"))}</p>${body}</body></html>`;
  previewedReport={title,filename,doc};
  document.getElementById("reportPreviewTitle").textContent=title;
  document.getElementById("reportPreviewFrame").srcdoc=doc;
  openDialog(document.getElementById("reportPreviewModal"));
}
function downloadPreviewedWord() {
  if(!previewedReport) return;
  downloadBlob(new Blob(["\\ufeff",previewedReport.doc],{type:"application/msword"}),previewedReport.filename);
  toast("Relatório Word baixado.");
}
function printPreviewedReport() {
  const frame=document.getElementById("reportPreviewFrame");
  if(!previewedReport || !frame.contentWindow) return;
  frame.contentWindow.focus();
  frame.contentWindow.print();
}
function clearReportPreview() {
  document.getElementById("reportPreviewFrame").removeAttribute("srcdoc");
  previewedReport=null;
}
function downloadBlob(blob,filename) {
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function closeDialog(id) {
  const dialog=document.getElementById(id); if(!dialog)return;
  if(typeof dialog.close==="function") dialog.close();
  else dialog.removeAttribute("open");
}
function formatDate(iso) { if(!iso)return"—"; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; }
function todayISO() { const d=new Date(),o=d.getTimezoneOffset(); return new Date(d.getTime()-o*60000).toISOString().slice(0,10); }
function esc(v="") { return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function attr(v="") { return esc(v); }
function html(v="") { return esc(v); }
function htmlLines(v="") { return esc(v).replace(/\\n/g,"<br>"); }
function safeName(v) { return v.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function toast(message) { const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600); }
initialize();
