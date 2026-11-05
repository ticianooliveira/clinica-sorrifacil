/* Recursos locais: pasta de dados e biblioteca PDF. Sem serviços externos. */
const LOCAL_TOOLS_DB = 'SorrifacilFerramentasLocaisV1';
const FOLDER_DIRTY = 'sorrifacil-pasta-alteracoes-pendentes-v1';
let dataFolder = null;
let folderAuthorized = false;
let folderBaseline = '';
let folderTimer = null;
let folderSaving = false;
let folderChanging = false;
let folderRevision = 0;
let importingLocalData = false;
let catalogs = [];
const catalogReaders = new Map();

function toolsDb() {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) {
      reject(new Error('O armazenamento offline não está disponível neste navegador.'));
      return;
    }
    let req;
    try { req = indexedDB.open(LOCAL_TOOLS_DB, 1); }
    catch (error) { reject(error); return; }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('settings')) req.result.createObjectStore('settings');
      if (!req.result.objectStoreNames.contains('catalogs')) req.result.createObjectStore('catalogs', {keyPath:'id'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function toolsStore(store, action, value, key) {
  const db = await toolsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, action === 'get' || action === 'getAll' ? 'readonly' : 'readwrite');
    const objectStore = tx.objectStore(store);
    let req;
    if (action === 'put') req = key === undefined ? objectStore.put(value) : objectStore.put(value, key);
    else if (action === 'delete') req = objectStore.delete(value);
    else if (action === 'get') req = objectStore.get(value);
    else if (action === 'clear') req = objectStore.clear();
    else req = objectStore.getAll();
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Operação cancelada.')); };
  });
}
function folderStatus(message) { const el=document.getElementById('folderStatus'); if(el)el.textContent = (dataFolder ? 'Pasta atual: ' + dataFolder.name + '. ' : '') + message; }
function hasPendingFolderChanges() { try{return localStorage.getItem(FOLDER_DIRTY) === '1';}catch(_){return false;} }
function markLocalChange() {
  if (importingLocalData || !dataFolder) return;
  folderRevision++;
  localStorage.setItem(FOLDER_DIRTY, '1');
  clearTimeout(folderTimer);
  if (!folderAuthorized) {
    folderStatus('Há alterações neste navegador. Autorize a pasta e use Salvar agora para gravá-las.');
    return;
  }
  folderStatus('Alterações salvas no navegador; aguardando gravação na pasta…');
  if (!folderChanging) folderTimer = setTimeout(() => writeFolderData(), 1500);
}
const originalPersist = persist;
persist = function() { originalPersist(); markLocalChange(); };
const originalDbPut = dbPut;
dbPut = async function(item) { const result = await originalDbPut({...item,assetVersion:cryptoId()}); markLocalChange(); return result; };
const originalDbDelete = dbDelete;
dbDelete = async function(id) { const result = await originalDbDelete(id); markLocalChange(); return result; };

function validateLocalBackup(data) {
  if (!data || (data.version !== undefined && data.version !== 1) || !Array.isArray(data.state?.patients)) throw Error('JSON incompatível: lista de pacientes não encontrada.');
  const ids = new Set();
  for (const p of data.state.patients) {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || typeof p.record !== 'string' || !Array.isArray(p.evolutions)) throw Error('Cadastro inválido no JSON.');
    ids.add(p.id);
    for (const e of p.evolutions) if (!e || typeof e.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(e.id) || typeof e.date !== 'string') throw Error('Evolução inválida no JSON.');
  }
  for (const collection of ['files','catalogs']) {
    if (data[collection] !== undefined && !Array.isArray(data[collection])) throw Error('Lista de arquivos inválida.');
    for (const file of data[collection] || []) if (!file || typeof file.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(file.id) || typeof file.name !== 'string' || typeof file.type !== 'string' || !(file.blob instanceof Blob || (typeof file.blob === 'string' && /^data:[^,]*;base64,/.test(file.blob)))) throw Error('Anexo inválido no JSON.');
  }
}
async function replaceStoredFiles(items) {
  const db = await openDb();
  await new Promise((resolve,reject) => {
    const tx = db.transaction(DB_STORE,'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.clear();
    for (const item of items) store.put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Falha ao restaurar anexos.'));
  });
  db.close();
}
async function applyLocalBackup(data) {
  validateLocalBackup(data);
  // Decodifica antes de substituir os dados existentes.
  const files = (data.files || []).map(f => ({...f, blob:f.blob instanceof Blob ? f.blob : dataURLToBlob(f.blob), assetVersion:f.blob instanceof Blob && f.assetVersion ? f.assetVersion : cryptoId()}));
  const pdfs = data.catalogs === undefined ? null : data.catalogs.map(f => ({...f, blob:f.blob instanceof Blob ? f.blob : dataURLToBlob(f.blob), assetVersion:f.blob instanceof Blob && f.assetVersion ? f.assetVersion : cryptoId()}));
  importingLocalData = true;
  clearTimeout(folderTimer);
  try {
    await replaceStoredFiles(files);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data.state));
    state = data.state;
    selectedPatientId = null;
    if (pdfs !== null) {
      const db = await toolsDb();
      await new Promise((resolve,reject) => {
        const tx = db.transaction('catalogs','readwrite');
        const store = tx.objectStore('catalogs'); store.clear();
        for (const pdf of pdfs) store.put(pdf);
        tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
      });
      db.close();
      closeAllCatalogs();
    }
    renderAll(); await refreshAttachments(); await loadCatalogs(); showView('dashboard');
  } finally { importingLocalData = false; }
}
// Mantém os botões antigos e aceita os backups anteriores sem catálogos.
downloadBackup = async function() {
  try {
    const parts = ['{"version":1,"createdAt":',JSON.stringify(new Date().toISOString()),',"state":',JSON.stringify(state),',"files":['];
    const files = await dbGetAll();
    const pdfs = await toolsStore('catalogs','getAll');
    async function appendFiles(items) {
      for (let i=0;i<items.length;i++) {
        if(i)parts.push(',');
        const {blob,...metadata}=items[i];
        parts.push(JSON.stringify(metadata).slice(0,-1),',"blob":"data:',blob.type||'application/octet-stream',';base64,');
        // Cada pedaço tem tamanho múltiplo de três para concatenar base64.
        for(let offset=0;offset<blob.size;offset+=196608) {
          const bytes=new Uint8Array(await blob.slice(offset,offset+196608).arrayBuffer());
          let binary='';
          for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
          parts.push(btoa(binary));
        }
        parts.push('"}');
      }
    }
    await appendFiles(files);parts.push('],"catalogs":[');await appendFiles(pdfs);parts.push(']}');
    downloadBlob(new Blob(parts,{type:'application/json'}),`backup-acompanhamento-${todayISO()}.json`);
    toast('Cópia completa criada com pacientes, evoluções, anexos e catálogos.');
  } catch (error) { alert('Não foi possível criar a cópia: '+error.message); }
};
restoreBackup = async function(ev) {
  const file=ev.target.files[0]; if(!file)return;
  if(!confirm('Restaurar esta cópia substituirá os pacientes e anexos atuais. Guarde uma cópia dos dados atuais antes de continuar.')) {ev.target.value='';return;}
  try {
    await applyLocalBackup(await hydrateFolderBackup(await readBackupFile(file)));
    markLocalChange(); toast('Cópia restaurada.');
  } catch(error) {alert('Não foi possível restaurar: '+error.message);}
  finally {ev.target.value='';}
};
async function newestFolderBackup() {
  let newest=null;
  for await (const [name,handle] of dataFolder.entries()) {
    if (handle.kind !== 'file' || !(/^(backup-acompanhamento.*|dados-sorrifacil)\.json$/i.test(name))) continue;
    const file=await handle.getFile();
    if (!newest || file.lastModified>newest.file.lastModified || (file.lastModified===newest.file.lastModified && name==='dados-sorrifacil.json')) newest={name,file,handle};
  }
  return newest;
}
function folderFingerprint(item) { return item ? `${item.name}:${item.file.lastModified}:${item.file.size}` : ''; }
async function loadFolderData(ask=true) {
  const newest=await newestFolderBackup();
  if(!newest) {folderBaseline='';folderStatus('Pasta conectada. Nenhum backup reconhecido. Use Salvar agora para criar dados-sorrifacil.json.');return;}
  if (ask && !confirm(`Carregar ${newest.name}? Os dados atuais deste navegador serão substituídos. Exporte uma cópia antes se precisar preservá-los.`)) return;
  const revision=folderRevision;
  const data=await hydrateFolderBackup(await readBackupFile(newest.file)); validateLocalBackup(data);
  if(folderRevision!==revision) throw Error('Os dados locais mudaram durante a leitura. Tente carregar novamente.');
  await applyLocalBackup(data);
  folderBaseline=folderFingerprint(newest);
  localStorage.removeItem(FOLDER_DIRTY);
  folderStatus(`Dados carregados de ${newest.name}. Salvamento automático ativo nesta pasta.`);
}
async function connectDataFolder() {
  if(!window.showDirectoryPicker) {folderStatus('O Firefox não permite gravar automaticamente em uma pasta local. Use Baixar cópia e Restaurar para transferir os dados; o restante do sistema continua funcionando offline.');return;}
  try {
    if(dataFolder && await dataFolder.requestPermission({mode:'readwrite'})==='granted') {
      folderAuthorized=true;
    } else {
      dataFolder=await window.showDirectoryPicker({mode:'readwrite'});
      folderAuthorized=true;
      await toolsStore('settings','put',dataFolder,'dataFolder');
      folderBaseline='';
    }
    if(hasPendingFolderChanges()) {
      folderStatus('Pasta autorizada. Há alterações locais pendentes: use Salvar agora para mantê-las ou Carregar dados para substituí-las pelo JSON da pasta.');
    } else await loadFolderData(true);
  } catch(error) {if(error.name!=='AbortError')folderStatus('Não foi possível conectar: '+error.message);}
}
async function changeDataFolder() {
  if (!window.showDirectoryPicker) {
    folderStatus('O Firefox não permite trocar uma pasta conectada. Use Baixar cópia e Restaurar para transferir os dados.');
    return;
  }
  if (folderSaving || folderChanging) {
    folderStatus('Aguarde a operação atual terminar antes de trocar a pasta.');
    return;
  }
  clearTimeout(folderTimer);
  folderChanging = true;
  try {
    // O seletor é aberto em cada clique, mesmo com uma pasta já autorizada.
    const nextFolder = await window.showDirectoryPicker({mode:'readwrite'});
    await toolsStore('settings','put',nextFolder,'dataFolder');
    dataFolder = nextFolder;
    folderAuthorized = true;
    folderBaseline = '';
    folderRevision++;
    localStorage.setItem(FOLDER_DIRTY,'1');
    folderStatus('Nova pasta selecionada. Os dados deste navegador foram mantidos. Clique em Salvar agora na pasta para gravá-los aqui; ou em Carregar dados da pasta para usar um JSON deste destino. Os arquivos da pasta anterior foram preservados.');
  } catch (error) {
    if (error.name === 'AbortError') {
      folderStatus('Troca cancelada. A pasta anterior foi mantida.');
    } else {
      folderStatus('Não foi possível trocar a pasta: ' + error.message);
    }
    if (dataFolder && folderAuthorized && hasPendingFolderChanges()) {
      folderTimer = setTimeout(() => writeFolderData(),1500);
    }
  } finally {
    folderChanging = false;
  }
}
async function reloadFolderData() {
  if(!dataFolder||!folderAuthorized){folderStatus('Primeiro clique em Conectar / autorizar pasta.');return;}
  try {await loadFolderData(true);}catch(error){folderStatus('Falha ao carregar: '+error.message);}
}
async function writeFolderData(manual=false) {
  clearTimeout(folderTimer);
  if (folderChanging) return;
  if(!dataFolder||!folderAuthorized) {folderStatus('Autorize a pasta para salvar. As alterações continuam neste navegador.');return;}
  if(folderSaving) {folderTimer=setTimeout(()=>writeFolderData(manual),1500);return;}
  folderSaving=true;
  try {
    const newest=await newestFolderBackup();
    if(folderFingerprint(newest)!==folderBaseline) {
      if(!manual || !confirm('Existe um JSON novo ou alterado na pasta. Salvar os dados deste navegador como dados-sorrifacil.json? Para usar o JSON da pasta, cancele e clique em Carregar dados.')) {
        folderStatus('JSON da pasta mudou. Salvamento pausado para evitar sobrescrever dados. Escolha Carregar dados ou Salvar agora.');return;
      }
    }
    const revision=folderRevision;
    const data=await buildFolderBackup();
    // Reconfere a pasta após montar uma cópia que pode incluir arquivos grandes.
    if(folderFingerprint(await newestFolderBackup())!==folderFingerprint(newest)) throw Error('O JSON da pasta mudou durante a gravação. Tente novamente.');
    const handle=await dataFolder.getFileHandle('dados-sorrifacil.json',{create:true});
    const writable=await handle.createWritable();
    try {await writable.write(JSON.stringify(data));await writable.close();}
    catch(error){try{await writable.abort();}catch(_){}throw error;}
    folderBaseline=folderFingerprint({name:'dados-sorrifacil.json',file:await handle.getFile()});
    if(revision===folderRevision) localStorage.removeItem(FOLDER_DIRTY);
    else folderTimer=setTimeout(()=>writeFolderData(),1500);
    folderStatus('Salvo na pasta às '+new Date().toLocaleTimeString('pt-BR')+'. Arquivo: dados-sorrifacil.json.');
  } catch(error) {folderStatus('Falha ao salvar na pasta: '+error.message+' Os dados continuam no navegador.');}
  finally {folderSaving=false;}
}
async function saveFolderNow(){await writeFolderData(true);}
async function disconnectDataFolder(){
  if(folderSaving || folderChanging){folderStatus('Aguarde a gravação terminar antes de desconectar.');return;}
  clearTimeout(folderTimer); dataFolder=null;folderAuthorized=false;folderBaseline='';
  await toolsStore('settings','delete','dataFolder');localStorage.removeItem(FOLDER_DIRTY);
  folderStatus('Pasta desconectada. Os arquivos e os dados do navegador foram preservados.');
}
window.addEventListener('beforeunload',event=>{
  if(dataFolder&&hasPendingFolderChanges()){event.preventDefault();event.returnValue='';}
});
async function loadCatalogs(){catalogs=await toolsStore('catalogs','getAll');renderCatalogs();}
async function addCatalogs(ev){
  try {
    for(const file of ev.target.files){
      if(!/\.pdf$/i.test(file.name))continue;
      const existing=catalogs.find(c=>c.name===file.name);
      if(existing&&!confirm(`Substituir o catálogo ${file.name}?`))continue;
      if(existing)closeCatalog(existing.id);
      await toolsStore('catalogs','put',{id:existing?.id||cryptoId(),name:file.name,type:'application/pdf',size:file.size,blob:file,assetVersion:cryptoId()});
    }
    await loadCatalogs();markLocalChange();toast('Catálogos salvos neste navegador.');
  }catch(error){alert('Não foi possível guardar os PDFs: '+error.message);}
  finally{ev.target.value='';}
}
function renderCatalogs(){
  const query=document.getElementById('catalogSearch').value.toLocaleLowerCase('pt-BR');
  const list=catalogs.filter(c=>c.name.toLocaleLowerCase('pt-BR').includes(query));
  const container=document.getElementById('catalogList');container.replaceChildren();
  if(!list.length){container.textContent='Nenhum catálogo encontrado. Adicione seus PDFs uma vez para consultá-los offline.';return;}
  for(const catalog of list){
    const row=document.createElement('div');row.className='catalog-item';
    const name=document.createElement('strong');name.textContent=catalog.name;row.append(name);
    const actions=document.createElement('div');actions.className='actions';
    for(const [label,fn] of [['Exibir aqui',()=>openCatalog(catalog.id)],['Abrir em aba',()=>openCatalogTab(catalog.id)],['Excluir',()=>removeCatalog(catalog.id)]]){
      const button=document.createElement('button');button.className='btn small';button.textContent=label;button.onclick=fn;actions.append(button);
    }
    row.append(actions);container.append(row);
  }
}
function openCatalog(id){
  if(catalogReaders.has(id))return;
  const catalog=catalogs.find(c=>c.id===id);if(!catalog)return;
  const url=URL.createObjectURL(catalog.blob);
  const panel=document.createElement('article');panel.className='catalog-reader';
  const header=document.createElement('header');const name=document.createElement('strong');name.textContent=catalog.name;header.append(name);
  const button=document.createElement('button');button.className='btn small';button.textContent='Fechar';button.onclick=()=>closeCatalog(id);header.append(button);
  const frame=document.createElement('iframe');frame.title=catalog.name;frame.src=url;
  panel.append(header,frame);document.getElementById('catalogReaders').append(panel);catalogReaders.set(id,{url,panel});
}
function closeCatalog(id){const reader=catalogReaders.get(id);if(!reader)return;reader.panel.remove();URL.revokeObjectURL(reader.url);catalogReaders.delete(id);}
function closeAllCatalogs(){for(const id of [...catalogReaders.keys()])closeCatalog(id);}
function openCatalogTab(id){
  const catalog=catalogs.find(c=>c.id===id);if(!catalog)return;
  const url=URL.createObjectURL(catalog.blob);
  // Uma aba por clique evita bloquear a abertura de vários catálogos.
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),600000);
}
async function removeCatalog(id){
  if(!confirm('Excluir este catálogo da biblioteca local?'))return;
  closeCatalog(id);await toolsStore('catalogs','delete',id);await loadCatalogs();markLocalChange();
}
(async()=>{
  try {
    await loadCatalogs();
    dataFolder=await toolsStore('settings','get','dataFolder');
    if(!dataFolder)return;
    folderAuthorized=await dataFolder.queryPermission({mode:'readwrite'})==='granted';
    if(!folderAuthorized){folderStatus('Pasta lembrada, mas precisa de autorização. Clique em Conectar / autorizar pasta.');return;}
    if(hasPendingFolderChanges()){folderStatus('Há alterações locais ainda não gravadas na pasta. Use Salvar agora ou escolha Carregar dados.');return;}
    await loadFolderData(false);
  } catch(error){folderStatus('Não foi possível carregar automaticamente: '+error.message+' Os dados locais foram mantidos.');}
})();

// O arquivo automático contém apenas metadados. Os binários ficam ao lado dele.
async function buildFolderBackup() {
  const snapshot=JSON.parse(JSON.stringify(state));
  const assetRoot=await dataFolder.getDirectoryHandle('arquivos-sorrifacil',{create:true});
  const packed={version:1, storageFormat:'folder-files-v1', createdAt:new Date().toISOString(),state:snapshot,files:[],catalogs:[]};
  async function saveAssets(items, category, collection) {
    const directory=await assetRoot.getDirectoryHandle(category,{create:true});
    for(const item of items) {
      if(!item.assetVersion) {
        item.assetVersion=cryptoId();
        if(collection==='files')await originalDbPut(item);
        else await toolsStore('catalogs','put',item);
      }
      const safeId=String(item.id).replace(/[^a-zA-Z0-9_-]/g,'_');
      const safeVersion=String(item.assetVersion).replace(/[^a-zA-Z0-9_-]/g,'_');
      const extension=(item.name.match(/\.([a-zA-Z0-9]{1,10})$/)||[])[1]||'bin';
      const filename=safeId+'-'+safeVersion+'.'+extension;
      let exists=false;
      try {const f=await (await directory.getFileHandle(filename)).getFile();exists=f.size===item.blob.size;}
      catch(error){if(error.name!=='NotFoundError')throw error;}
      if(!exists) {
        const handle=await directory.getFileHandle(filename,{create:true});
        const writer=await handle.createWritable();
        try {await writer.write(item.blob);await writer.close();}
        catch(error){try{await writer.abort();}catch(_){}throw error;}
      }
      const {blob,fileRef,...metadata}=item;
      packed[collection].push({...metadata,fileRef:'arquivos-sorrifacil/'+category+'/'+filename,size:blob.size});
    }
  }
  await saveAssets(await dbGetAll(),'anexos','files');
  await saveAssets(await toolsStore('catalogs','getAll'),'catalogos','catalogs');
  return packed;
}
async function hydrateFolderBackup(data) {
  if(data.storageFormat!=='folder-files-v1')return data;
  if(!dataFolder)throw Error('Este JSON usa arquivos separados. Conecte a pasta que contém o JSON e arquivos-sorrifacil antes de carregar.');
  // Valida a estrutura antes de abrir qualquer arquivo da pasta.
  if(!Array.isArray(data.files)||!Array.isArray(data.catalogs))throw Error('Listas de arquivos ausentes no JSON.');
  for(const collection of ['files','catalogs']) {
    for(const item of data[collection]) {
      if(!item || typeof item.fileRef!=='string' || !/^arquivos-sorrifacil\/(anexos|catalogos)\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(item.fileRef))throw Error('Referência de arquivo inválida no JSON.');
      const [root,category,name]=item.fileRef.split('/');
      try {
        const directory=await (await dataFolder.getDirectoryHandle(root)).getDirectoryHandle(category);
        const file=await (await directory.getFileHandle(name)).getFile();
        if(file.size!==item.size)throw Error('Tamanho diferente do registrado');
        item.blob=file;
      } catch(error){throw Error('Não foi possível ler '+item.name+'. Mantenha arquivos-sorrifacil junto do JSON. '+error.message);}
    }
  }
  return data;
}

// Leitura incremental: evita criar uma única string com todos os PDFs base64.
// Mantém compatibilidade com os JSONs completos das versões anteriores.
async function readBackupFile(file) {
  const reader=file.stream().getReader();
  const decoder=new TextDecoder();
  let buffer='',position=0,finished=false;
  async function more(){
    const {value,done}=await reader.read();
    if(done){buffer+=decoder.decode();finished=true;}
    else buffer+=decoder.decode(value,{stream:true});
  }
  async function peek(){while(position>=buffer.length&&!finished){buffer='';position=0;await more();}return position<buffer.length?buffer[position]:null;}
  async function take(){const c=await peek();if(c!==null)position++;return c;}
  async function whitespace(){while(true){const c=await peek();if(c==='\ufeff'||c===' '||c==='\n'||c==='\r'||c==='\t')await take();else return;}}
  async function expect(c){await whitespace();if(await take()!==c)throw Error('JSON inválido.');}
  async function value(){
    await whitespace();const first=await peek();
    if(first===null)throw Error('JSON incompleto.');
    const chunks=[];let chunk='',depth=0,quoted=false,escaped=false;
    while(true){
      const c=await peek();
      if(c===null)break;
      if(!quoted&&depth===0&&chunk.length+chunks.length>0&&(c===','||c===']'||c==='}'||/\s/.test(c)))break;
      await take();chunk+=c;
      if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
      else if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']')depth--;
      if(chunk.length>=65536){chunks.push(chunk);chunk='';}
      if(!quoted&&depth===0&&(first==='"'||first==='{'||first==='['))break;
    }
    chunks.push(chunk);return JSON.parse(chunks.join(''));
  }
  try {
    const result={};await expect('{');await whitespace();
    if(await peek()==='}'){await take();return result;}
    while(true){
      const key=await value();if(typeof key!=='string')throw Error('Chave JSON inválida.');await expect(':');
      if(key==='files'||key==='catalogs'){
        await expect('[');const items=[];await whitespace();
        if(await peek()!==']')while(true){items.push(await value());await whitespace();const c=await take();if(c===']')break;if(c!==',')throw Error('Lista JSON inválida.');}
        else await take();
        Object.defineProperty(result,key,{value:items,enumerable:true,configurable:true,writable:true});
      }else Object.defineProperty(result,key,{value:await value(),enumerable:true,configurable:true,writable:true});
      await whitespace();const c=await take();if(c==='}')break;if(c!==',')throw Error('JSON inválido.');
    }
    await whitespace();if(await peek()!==null)throw Error('Conteúdo extra no JSON.');return result;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
