// github-api.js
const GitHubAPI = {
  token: null,
  currentRepo: null,
  fileCache: {},
  authErrorShown: false,
  
  init() {
    if (typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN.trim().length > 0) {
      this.token = GITHUB_TOKEN.trim();
      // Hide PAT container immediately if token exists
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
  
  getHeaders() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },
  
  async handleAuthError(response) {
    let errorMsg = 'Your GitHub token is invalid or has insufficient permissions.';
    
    if (response.status === 401) {
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
  
  async fetchWithFallback(url, options = {}) {
    if (this.token) {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return { response, authError: null };
      }
      
      if (response.status === 401 || response.status === 403) {
        console.log('Auth failed with token, attempting without token for public repo...');
        
        // Fetch WITHOUT any auth headers - completely fresh request
        const publicResponse = await fetch(url, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        
        if (publicResponse.ok) {
          // Only return authError once per session
          const authError = this.authErrorShown ? null : 'Token is invalid. Fetching as public repo instead. Fix or remove your token.';
          this.authErrorShown = true;
          return { response: publicResponse, authError };
        }
        
        const errorMsg = await this.handleAuthError(response);
        return { response, authError: errorMsg };
      }
      
      return { response, authError: null };
    }
    
    // No token: just fetch normally
    const response = await fetch(url, { 
      headers: { 'Accept': 'application/vnd.github.v3+json' } 
    });
    return { response, authError: null };
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
      { headers: this.getHeaders() }
    );
    if (!r.ok) throw new Error(r.statusText);
    return { branches: (await r.json()).map(b => b.name), authError };
  },
  
  async fetchDefaultBranch(owner, repo) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: this.getHeaders() }
    );
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    return { defaultBranch: j.default_branch || 'main', authError };
  },
  
  async fetchLastCommit(owner, repo, branch) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
      { headers: this.getHeaders() }
    );
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    return { message: j.commit.message.split('\n')[0], authError };
  },
  
  async fetchContent(path) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${this.currentRepo.owner}/${this.currentRepo.repo}/contents/${encodeURIComponent(path)}?ref=${this.currentRepo.branch}`,
      { headers: this.getHeaders() }
    );
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    if (j.encoding !== 'base64') throw new Error('Bad encoding');
    return { content: atob(j.content), authError };
  },
  
  async fetchTree(owner, repo, branch) {
    const { response: r, authError } = await this.fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: this.getHeaders() }
    );
    if (!r.ok) throw new Error(r.statusText);
    return { tree: await r.json(), authError };
  }
};
