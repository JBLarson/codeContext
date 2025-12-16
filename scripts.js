document.addEventListener('DOMContentLoaded', async () => {
  const repoUrlInput      = document.getElementById('repoUrl');
  const githubPatInput    = document.getElementById('githubPat');
  const patContainer      = document.getElementById('patContainer');
  const branchSelect      = document.getElementById('branchSelect');
  const commitInfo        = document.getElementById('commitInfo');
  const fetchFilesBtn     = document.getElementById('fetchFilesBtn');
  const selectAllBtn      = document.getElementById('selectAllBtn');
  const fileListContainer = document.getElementById('fileListContainer');
  const userInstructions  = document.getElementById('userInstructions');
  const outputMessage     = document.getElementById('outputMessage');
  const copyBtn           = document.getElementById('copyBtn');
  const statusMessages    = document.getElementById('statusMessages');
  const authErrorContainer = document.getElementById('authErrorContainer');
  const authErrorMessage   = document.getElementById('authErrorMessage');

  let currentRepo = null;
  let fileCache = {};
  
  // Initialize token from config.js if available
  let token = null;

  // Check if GITHUB_TOKEN is defined in token.js and has a value
  if (typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN.trim().length > 0) {
    token = GITHUB_TOKEN.trim();
    // Hide the input field if we have a valid token from config
    if (patContainer) {
      patContainer.style.display = 'none';
    }
  }

  githubPatInput.addEventListener('input', () => {
    // Only update token from input if config token wasn't used/valid
    token = githubPatInput.value.trim() || null;
    clearAuthError();
  });

  function showLoading(msg) {
    statusMessages.innerHTML = `<div class="message-area loading-message">${msg}</div>`;
  }

  function showError(msg) {
    statusMessages.innerHTML = `<div class="message-area error-message">${msg}</div>`;
  }

  function clearStatus() {
    statusMessages.innerHTML = '';
  }

  function showAuthError(msg) {
    authErrorMessage.textContent = msg;
    authErrorContainer.style.display = 'block';
  }

  function clearAuthError() {
    authErrorContainer.style.display = 'none';
  }

  function getHeaders() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  function shouldShowAuthError(response) {
    // Only show auth errors if we have a token AND got auth-related errors
    // This prevents false positives for public repos
    if (!token) return false;
    return response.status === 401 || response.status === 403;
  }

  async function handleAuthError(response) {
    let errorMsg = 'Your GitHub token is invalid or has insufficient permissions.';
    
    if (response.status === 401) {
      errorMsg = 'GitHub authentication failed. Your token may be invalid or expired.';
    } else if (response.status === 403) {
      try {
        const body = await response.json();
        if (body.message && body.message.includes('API rate limit')) {
          errorMsg = 'GitHub API rate limit exceeded. Wait an hour or use a valid token.';
        } else if (body.message && body.message.includes('Resource not accessible')) {
          errorMsg = 'Token does not have access to this repository. Check token permissions and organization settings.';
        } else {
          errorMsg = 'GitHub access forbidden. Your token may lack necessary permissions or organization approval.';
        }
      } catch {
        errorMsg = 'GitHub access forbidden. Your token may lack necessary permissions.';
      }
    }
    
    showAuthError(errorMsg);
  }

  userInstructions.addEventListener('input', renderOutput);

  function parseUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'github.com') return null;
      const parts = u.pathname.split('/').filter(p=>p);
      if (parts.length<2) return null;
      return { owner: parts[0], repo: parts[1] };
    } catch {
      return null;
    }
  }

  async function fetchBranches(owner, repo) {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, { headers: getHeaders() });
    if (!r.ok) {
      if (shouldShowAuthError(r)) await handleAuthError(r);
      throw new Error(r.statusText);
    }
    return (await r.json()).map(b=>b.name);
  }

  async function fetchDefaultBranch(owner,repo) {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: getHeaders() });
    if (!r.ok) {
      if (shouldShowAuthError(r)) await handleAuthError(r);
      throw new Error(r.statusText);
    }
    const j = await r.json();
    return j.default_branch || 'main';
  }

  async function fetchLastCommit(owner, repo, branch) {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, { headers: getHeaders() });
    if (!r.ok) {
      if (shouldShowAuthError(r)) await handleAuthError(r);
      throw new Error(r.statusText);
    }
    const j = await r.json();
    return j.commit.message.split('\n')[0];
  }

  async function updateCommitInfo() {
    if (!currentRepo) {
      commitInfo.textContent = '';
      return;
    }
    try {
      const message = await fetchLastCommit(currentRepo.owner, currentRepo.repo, currentRepo.branch);
      commitInfo.textContent = `Latest commit: ${message}`;
    } catch {
      commitInfo.textContent = '';
    }
  }

  function updatePromptHeader() {
    if (!currentRepo) return;
    const header = `This is code context for the ${currentRepo.owner}/${currentRepo.repo} repository (branch: ${currentRepo.branch}).`;
    const suffix = "RESPOND WITH COMPLETE FILES I CAN COPY AND PASTE";
    const headerPrefix = "This is code context for the";

    let currentVal = userInstructions.value;
    const cleanVal = currentVal.trim();

    if (cleanVal === suffix || cleanVal === "") {
      userInstructions.value = `${header}\n\n${suffix}`;
    } 
    else if (currentVal.startsWith(headerPrefix)) {
      const lines = currentVal.split('\n');
      lines[0] = header;
      userInstructions.value = lines.join('\n');
    } 
    else {
      userInstructions.value = `${header}\n\n${currentVal}`;
    }
    renderOutput();
  }

  fetchFilesBtn.addEventListener('click', async () => {
    clearStatus();
    clearAuthError();
    const url = repoUrlInput.value.trim();
    const info = parseUrl(url);
    if (!info) { showError('Invalid GitHub URL.'); return; }

    showLoading('Loading branches…');
    branchSelect.disabled = true;
    try {
      const [branches, def] = await Promise.all([
        fetchBranches(info.owner, info.repo),
        fetchDefaultBranch(info.owner, info.repo)
      ]);
      branchSelect.innerHTML = branches
        .map(b=>`<option value="${b}"${b===def?' selected':''}>${b}</option>`)
        .join('');
      branchSelect.disabled = false;
      currentRepo = { ...info, branch: branchSelect.value };
      fileCache = {};
      
      await updateCommitInfo();
      updatePromptHeader();
      loadTree();
    } catch (e) {
      showError(`Branch error: ${e.message}`);
    } finally {
      clearStatus();
    }
  });

  branchSelect.addEventListener('change', async () => {
    if (!currentRepo) return;
    currentRepo.branch = branchSelect.value;
    fileCache = {};
    await updateCommitInfo();
    updatePromptHeader();
    loadTree();
  });

  selectAllBtn.addEventListener('click', async () => {
    const allCheckboxes = fileListContainer.querySelectorAll('input[type="checkbox"]');
    const allChecked = [...allCheckboxes].every(cb => cb.checked);
    
    if (allChecked) {
      allCheckboxes.forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
      });
      renderOutput();
    } else {
      const toFetch = [];
      allCheckboxes.forEach(cb => {
        cb.checked = true;
        cb.indeterminate = false;
        if (cb.dataset.nodeType === 'file' && !fileCache[cb.value]) {
          toFetch.push(cb.value);
        }
      });
      
      if (toFetch.length) {
        showLoading(`Fetching ${toFetch.length} files…`);
        await Promise.all(toFetch.map(async p => {
          try { 
            fileCache[p] = await fetchContent(p); 
          } catch {
            /* ignore */
          }
        }));
        clearStatus();
      }
      
      renderOutput();
    }
    updateSelectAllButton();
  });

  async function loadTree() {
    showLoading(`Fetching tree (${currentRepo.branch})…`);
    fetchFilesBtn.disabled = true;
    selectAllBtn.disabled = true;
    fileListContainer.innerHTML = '<p>Fetching files…</p>';
    try {
      const r = await fetch(
        `https://api.github.com/repos/${currentRepo.owner}/${currentRepo.repo}/git/trees/${currentRepo.branch}?recursive=1`,
        { headers:getHeaders() }
      );
      if (!r.ok) {
        if (shouldShowAuthError(r)) await handleAuthError(r);
        throw new Error(r.statusText);
      }
      const data = await r.json();
      fileListContainer.innerHTML = '';
      if (data.truncated) {
        fileListContainer.innerHTML = `<div class="message-area warning-message">File list truncated.</div>`;
      }
      if (!data.tree || !data.tree.length) {
        fileListContainer.innerHTML += '<p>No files found.</p>';
      } else {
        const tree = buildTree(data.tree);
        renderTree(tree, fileListContainer);
        selectAllBtn.disabled = false;
        updateSelectAllButton();
      }
    } catch (e) {
      showError(`Fetch error: ${e.message}`);
      fileListContainer.innerHTML = '<p>Could not fetch files.</p>';
    } finally {
      clearStatus();
      fetchFilesBtn.disabled = false;
      renderOutput();
    }
  }

  function buildTree(items) {
    const root = { children: {} };
    items.filter(i=>i.type==='blob'||i.type==='tree')
      .sort((a,b)=>a.path.localeCompare(b.path))
      .forEach(i=>{
        const parts = i.path.split('/');
        let cur = root.children, acc = [];
        parts.forEach((p,idx)=>{
          acc.push(p);
          const path = acc.join('/');
          const isFile = idx===parts.length-1 && i.type==='blob';
          if (!cur[p]) cur[p] = { name:p, type:isFile?'file':'dir', path, children:isFile?null:{} };
          if (cur[p].type==='dir') cur = cur[p].children;
        });
      });
    return root;
  }

  function renderTree(node, container) {
    if (!node.children) return;
    const ul = document.createElement('ul'); ul.className = 'file-tree-root';
    Object.values(node.children).sort((a,b)=>{
      if(a.type==='dir'&&b.type==='file') return -1;
      if(a.type==='file'&&b.type==='dir') return 1;
      return a.name.localeCompare(b.name);
    }).forEach(c=>ul.appendChild(nodeToElement(c)));
    container.appendChild(ul);
  }

  function isImageFile(name) {
    return /\.(png|jpe?g|gif|bmp|svg|webp|ico|tif|tiff)$/i.test(name);
  }

  function nodeToElement(n) {
    const li = document.createElement('li');
    li.className = `file-tree-node node-type-${n.type}`;
    li.dataset.nodePath = n.path;
    const d = document.createElement('div');
    d.className = 'node-content';

    if (n.type === 'dir') {
      const t = document.createElement('span');
      t.className = 'dir-toggle';
      t.textContent = '►';
      t.onclick = e => {
        e.stopPropagation();
        const sub = li.querySelector('ul');
        if (!sub) return;
        const show = sub.style.display !== 'block';
        sub.style.display = show ? 'block' : 'none';
        t.classList.toggle('open', show);
      };
      d.appendChild(t);
    }

    if (n.type === 'file' && isImageFile(n.name)) {
      const lbl = document.createElement('label');
      lbl.textContent = n.name;
      lbl.style.opacity = '0.6';
      d.appendChild(lbl);
    } else {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = n.path;
      cb.dataset.nodeType = n.type;
      cb.id = `cb-${n.path.replace(/[^A-Za-z0-9_.-]/g,'_')}`;
      const lbl = document.createElement('label');
      lbl.htmlFor = cb.id;
      lbl.textContent = n.name;
      if (n.type === 'dir') lbl.className = 'dir-label';
      d.appendChild(cb);
      d.appendChild(lbl);
      if (n.type === 'file') {
        const ld = document.createElement('span');
        ld.className = 'loading-indicator';
        ld.textContent = 'loading...';
        d.appendChild(ld);
        cb.onchange = onFileChange;
      } else {
        cb.onchange = onDirChange;
      }
    }

    li.appendChild(d);

    if (n.type === 'dir' && n.children) {
      const sub = document.createElement('ul');
      sub.style.display = 'none';
      Object.values(n.children).sort((a,b)=>{
        if(a.type==='dir'&&b.type==='file') return -1;
        if(a.type==='file'&&b.type==='dir') return 1;
        return a.name.localeCompare(b.name);
      }).forEach(c=>sub.appendChild(nodeToElement(c)));
      li.appendChild(sub);
    }
    return li;
  }

  async function onFileChange(e){
    const cb=e.target, path=cb.value, li=cb.closest('.file-tree-node');
    if(cb.checked && !fileCache[path]){
      li.classList.add('is-loading');
      try {
        fileCache[path] = await fetchContent(path);
      } catch {
        cb.checked=false;
      } finally {
        li.classList.remove('is-loading');
      }
    }
    renderOutput(); 
    updateParents(cb);
    updateSelectAllButton();
  }

  async function onDirChange(e){
    const dirCb=e.target, checked=dirCb.checked, li=dirCb.closest('.file-tree-node');
    const all = li.querySelectorAll('input[type="checkbox"]'), toFetch=[];
    all.forEach(cb=>{
      cb.checked=checked; cb.indeterminate=false;
      if(checked&&cb.dataset.nodeType==='file'&&!fileCache[cb.value]) toFetch.push(cb.value);
    });
    if(toFetch.length){
      showLoading(`Fetching ${toFetch.length} files…`);
      await Promise.all(toFetch.map(async p=>{
        try { fileCache[p]=await fetchContent(p); }
        catch{/*ignore*/}
      }));
      clearStatus();
    }
    renderOutput(); 
    updateParents(dirCb);
    updateSelectAllButton();
  }

  function updateParents(cb){
    let ul=cb.closest('ul');
    while(ul && !ul.classList.contains('file-tree-root')){
      const pLi=ul.parentElement, pCb=pLi.querySelector('> .node-content input[type="checkbox"]');
      const children= pLi.querySelectorAll('> ul input[type="checkbox"]');
      const total=children.length, checked=[...children].filter(x=>x.checked).length;
      if(checked===0){ pCb.checked=false; pCb.indeterminate=false; }
      else if(checked===total){ pCb.checked=true; pCb.indeterminate=false; }
      else{ pCb.checked=false; pCb.indeterminate=true; }
      ul=pLi.closest('ul');
    }
  }

  function updateSelectAllButton() {
    const allCheckboxes = fileListContainer.querySelectorAll('input[type="checkbox"]');
    if (allCheckboxes.length === 0) {
      selectAllBtn.textContent = 'Select All';
      return;
    }
    const allChecked = [...allCheckboxes].every(cb => cb.checked);
    
    if (allChecked) {
      selectAllBtn.textContent = 'Deselect All';
    } else {
      selectAllBtn.textContent = 'Select All';
    }
  }

  async function fetchContent(path){
    const r = await fetch(
      `https://api.github.com/repos/${currentRepo.owner}/${currentRepo.repo}/contents/${encodeURIComponent(path)}?ref=${currentRepo.branch}`,
      { headers:getHeaders() }
    );
    if(!r.ok) {
      if (shouldShowAuthError(r)) await handleAuthError(r);
      throw new Error(r.statusText);
    }
    const j = await r.json();
    if(j.encoding!=='base64') throw new Error('Bad encoding');
    return atob(j.content);
  }

  function renderOutput(){
    let out = userInstructions.value || '';
    fileListContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb=>{
      if(cb.dataset.nodeType==='file'&&fileCache[cb.value]){
        out += `\n\n---\n\n${cb.value}\n\n---\n\n${fileCache[cb.value]}`;
      }
    });
    outputMessage.value = out;
  }

  copyBtn.addEventListener('click', ()=>{
    if(!outputMessage.value){ showError('Nothing to copy.'); setTimeout(clearStatus,2000); return; }
    navigator.clipboard.writeText(outputMessage.value)
      .then(_=>{ copyBtn.textContent='Copied!'; setTimeout(_=>copyBtn.textContent='Copy to Clipboard',1500); })
      .catch(_=>{ showError('Copy failed.'); });
  });
});