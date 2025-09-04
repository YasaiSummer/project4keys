const axios = require('axios');

class BacklogApiService {
  constructor(spaceKey, apiKey) {
    this.spaceKey = spaceKey;
    this.apiKey = apiKey;
    this.baseURL = `https://${spaceKey}.backlog.com/api/v2`;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      params: {
        apiKey: this.apiKey
      },
      timeout: 30000
    });
  }

  async getUserInfo() {
    try {
      const response = await this.client.get('/users/myself');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  async getSpaceInfo() {
    try {
      const response = await this.client.get('/space');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get space info: ${error.message}`);
    }
  }

  async getProjects() {
    try {
      const response = await this.client.get('/projects');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get projects: ${error.message}`);
    }
  }

  async getProjectByKey(projectKey) {
    try {
      const response = await this.client.get(`/projects/${projectKey}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get project ${projectKey}: ${error.message}`);
    }
  }

  async getIssueTypes(projectId) {
    try {
      const response = await this.client.get(`/projects/${projectId}/issueTypes`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get issue types for project ${projectId}: ${error.message}`);
    }
  }

  async getStatuses(projectId) {
    try {
      const response = await this.client.get(`/projects/${projectId}/statuses`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get statuses for project ${projectId}: ${error.message}`);
    }
  }

  async getCategories(projectId) {
    try {
      const response = await this.client.get(`/projects/${projectId}/categories`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get categories for project ${projectId}: ${error.message}`);
    }
  }

  async getIssues(params = {}) {
    try {
      const response = await this.client.get('/issues', { params });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get issues: ${error.message}`);
    }
  }

  async getIssuesCount(params = {}) {
    try {
      const response = await this.client.get('/issues/count', { params });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get issues count: ${error.message}`);
    }
  }

  async getGitRepositories(projectId) {
    try {
      const response = await this.client.get(`/projects/${projectId}/git/repositories`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get git repositories for project ${projectId}: ${error.message}`);
    }
  }

  async getCommits(projectId, repoId, params = {}) {
    try {
      const response = await this.client.get(
        `/projects/${projectId}/git/repositories/${repoId}/commits`,
        { params }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get commits: ${error.message}`);
    }
  }

  buildIssueFilters(options = {}) {
    const filters = {};
    
    if (options.projectId) {
      filters['projectId[]'] = Array.isArray(options.projectId) 
        ? options.projectId 
        : [options.projectId];
    }
    
    if (options.statusId) {
      filters['statusId[]'] = Array.isArray(options.statusId) 
        ? options.statusId 
        : [options.statusId];
    }
    
    if (options.issueTypeId) {
      filters['issueTypeId[]'] = Array.isArray(options.issueTypeId) 
        ? options.issueTypeId 
        : [options.issueTypeId];
    }
    
    if (options.categoryId) {
      filters['categoryId[]'] = Array.isArray(options.categoryId) 
        ? options.categoryId 
        : [options.categoryId];
    }
    
    if (options.createdSince) {
      filters.createdSince = options.createdSince;
    }
    
    if (options.createdUntil) {
      filters.createdUntil = options.createdUntil;
    }
    
    if (options.updatedSince) {
      filters.updatedSince = options.updatedSince;
    }
    
    if (options.updatedUntil) {
      filters.updatedUntil = options.updatedUntil;
    }
    
    if (options.count) {
      filters.count = options.count;
    }
    
    if (options.offset) {
      filters.offset = options.offset;
    }
    
    return filters;
  }

  async getAllIssues(projectId, filters = {}) {
    const allIssues = [];
    let offset = 0;
    const count = 100;
    
    while (true) {
      const params = this.buildIssueFilters({
        projectId,
        ...filters,
        count,
        offset
      });
      
      const issues = await this.getIssues(params);
      
      if (issues.length === 0) {
        break;
      }
      
      allIssues.push(...issues);
      offset += count;
      
      if (issues.length < count) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return allIssues;
  }
}

module.exports = BacklogApiService;