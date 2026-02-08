// github-api.js
const GitHubAPI = {
  token: null,
  orgToken: null,
  orgToken2: null,
  currentRepo: null,
  fileCache: {},
  authErrorShown: false,
  
  init() {
    if (typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN.trim().length > 0) {
      this.token = GITHUB_TOKEN.trim();
    }
    if (typeof GITHUB_TOKEN_ORG !== 'undefined' && GITHUB_TOKEN_ORG.trim().length > 0) {
      this.orgToken = GITHUB_TOKEN_ORG.trim();
    }
    if (typeof GITHUB_TOKEN_ORG2 !== 'undefined' && GITHUB_TOKEN_ORG2.trim().length > 0) {
      this.orgToken2 = GITHUB_TOKEN_ORG2.trim();
    }
    
    if (this.token || this.orgToken || this.orgToken2) {
      const patContainer = document.getElementById('patContainer');
      if (patContainer) {
        patContainer.style.display = 'none';
      }
    }
  },
  
  setToken(token) {
    this.token = token;
    this.authErrorShown = false;
  },
  
  isNeurofoldRepo(owner) {
    return owner && owner.toLowerCase() === 'neurofold';
  },
  
  getAllTokens(owner) {
    const tokens = [];
    
    if (this.isNeurofoldRepo(owner)) {
      if (this.orgToken) tokens.push(this.orgToken);
      if (this.orgToken2) tokens.push(this.orgToken2);
      if (this.token) tokens.push(this.token);
    } else {
      if (this.token) tokens.push(this.token);
      if (this.orgToken) tokens.push(this.orgToken);
      if (this.orgToken2) tokens.push(this.orgToken2);
    }
    
    return tokens;
  },
  
  getHeaders(token = null) {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },
  
  async handleAuthError(response) {
    let errorMsg = 'Your GitHub token is invalid or has insufficient permissions.';
    
    if (response.status === 404) {
      errorMsg = 'Repository not found or you do not have access. Check that: 1) The repo URL is correct, 2) Your PAT has access to this organization, 3) The PAT has been authorized for SSO if required.';
    } else if (response.status === 401) {
      errorMsg = 'GitHub authentication failed. Your token may be invalid or expired.';
    } else if (response.status === 403) {
      try {
        const body = await response.json();
        if (body.message && body.message.includes('API rate limit')) {
          errorMsg = 'GitHub API rate limit exceeded for unauthenticated requests. Enter a valid token to increase limits.';
        } else if (body.message && body.message.includes('Resource not accessible')) {
          errorMsg = 'Token does not have access to this repository. Check token permissions and organization settings.';
        } else {
          errorMsg = 'GitHub access forbidden. Your token may lack necessary permissions or organization approval.';
        }
      } catch {
        errorMsg = 'GitHub access forbidden. Your token may lack necessary permissions.';
      }
    }
    
    return errorMsg;
  },
  
  async fetchWithFallback(url, owner = null, options = {}) {
    const tokens = this.getAllTokens(owner);
    let lastResponse = null;
    
    for (const token of tokens) {
      const response = await fetch(url, {
        ...options,
        headers: this.getHeaders(token)
      });
      
      if (response.ok) {
        return { response, authError: null };
      }
      
      lastResponse = response;
      
      if (response.status === 401 || response.status === 403) {
        continue;
      }
      
      if (response.status === 404) {
        continue;
      }
      
      return { response, authError: null };
    }
    
    console.log('All tokens failed, attempting public access...');
    const publicResponse = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    
    if (publicResponse.ok) {
      const authError = this.authErrorShown ? null : 'All tokens failed. Fetching as public repo instead. Check your token permissions.';
      this.authErrorShown = true;
      return { response: publicResponse, authError };
    }
    
    const errorMsg = await this.handleAuthError(lastResponse || publicResponse);
    return { response: lastResponse || publicResponse, authError: errorMsg };
  },
  
  parseUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'github.com') return null;
      const parts = u.pathname.split('/').filter(p => p);
      if (parts.length < 2) return null;
      return { owner: parts[0], repo: parts[1] };
    } catch {
      return null;
    }
  },
  
  async fetchBranches(owner, repo) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      owner
    );
    if (!r.ok) throw new Error(r.statusText);
    return { branches: (await r.json()).map(b => b.name), authError };
  },
  
  async fetchDefaultBranch(owner, repo) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}`,
      owner
    );
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    return { defaultBranch: j.default_branch || 'main', authError };
  },
  
  async fetchLastCommit(owner, repo, branch) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
      owner
    );
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    return { message: j.commit.message.split('\n')[0], authError };
  },
  
  async fetchContent(path) {
    const owner = this.currentRepo?.owner;
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${this.currentRepo.owner}/${this.currentRepo.repo}/contents/${encodeURIComponent(path)}?ref=${this.currentRepo.branch}`,
      owner
    );
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    if (j.encoding !== 'base64') throw new Error('Bad encoding');
    return { content: atob(j.content), authError };
  },
  
  async fetchTree(owner, repo, branch) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      owner
    );
    if (!r.ok) throw new Error(r.statusText);
    return { tree: await r.json(), authError };
  }
};
