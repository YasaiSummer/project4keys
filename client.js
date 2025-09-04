const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

class APIClient {
  constructor(baseURL = BASE_URL) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getUsers() {
    try {
      const response = await this.client.get('/users');
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error.message);
      throw error;
    }
  }

  async getUser(id) {
    try {
      const response = await this.client.get(`/users/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching user ${id}:`, error.message);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      const response = await this.client.post('/users', userData);
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error.message);
      throw error;
    }
  }

  async getExternalPosts() {
    try {
      const response = await this.client.get('/external/posts');
      return response.data;
    } catch (error) {
      console.error('Error fetching external posts:', error.message);
      throw error;
    }
  }
}

async function demo() {
  console.log('🚀 API Client Demo - Similar to Laravel API calls');
  console.log('='.repeat(50));

  const client = new APIClient();

  try {
    console.log('\n📝 Fetching all users...');
    const users = await client.getUsers();
    console.log('Users:', JSON.stringify(users, null, 2));

    console.log('\n👤 Fetching user with ID 1...');
    const user = await client.getUser(1);
    console.log('User:', JSON.stringify(user, null, 2));

    console.log('\n➕ Creating new user...');
    const newUser = await client.createUser({
      name: 'Alice Johnson',
      email: 'alice@example.com'
    });
    console.log('New user created:', JSON.stringify(newUser, null, 2));

    console.log('\n🌐 Fetching external API data...');
    const posts = await client.getExternalPosts();
    console.log('External posts:', JSON.stringify(posts, null, 2));

  } catch (error) {
    console.error('Demo failed:', error.message);
  }
}

if (require.main === module) {
  demo();
}

module.exports = APIClient;