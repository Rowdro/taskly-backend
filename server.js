require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: [
    'https://taskll-app.netlify.app',  // Your frontend
    'http://localhost:3000'            // Local development
  ],
  credentials: true
}));

// HEALTH CHECK - MUST RESPOND IMMEDIATELY
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: supabase ? 'connected' : 'mock'
  });
});

// ========== SUPABASE CLIENT ==========
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // ← Use SERVICE key for backend

let supabase;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    console.log('✅ Supabase client initialized (using service_role key)');
  } catch (err) {
    console.error('❌ Supabase init error:', err.message);
    supabase = null;
  }
} else {
  console.log('⚠️ Supabase credentials missing - running in mock mode');
  supabase = null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ========== MIDDLEWARE: AUTH TOKEN ==========
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ========== HEALTH & ROOT ENDPOINTS (CRITICAL FOR RENDER) ==========
app.get('/', (req, res) => {
  res.json({ 
    message: 'Taskly Backend API', 
    status: 'running',
    version: '1.0.0',
    database: supabase ? 'connected' : 'mock-mode'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Taskly API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Taskly API is running' });
});

// ========== USER REGISTRATION ==========
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // If supabase not connected, return mock response
    if (!supabase) {
      return res.status(201).json({
        success: true,
        user: {
          id: 'mock-user-id',
          email: email,
          firstName: firstName,
          lastName: lastName,
          createdAt: new Date().toISOString()
        },
        token: 'mock-jwt-token-for-development'
      });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert([
        {
          email: email.toLowerCase(),
          password: hashedPassword,
          first_name: firstName,
          last_name: lastName,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ========== USER LOGIN ==========
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // If supabase not connected, return mock response
    if (!supabase) {
      return res.json({
        success: true,
        user: {
          id: 'mock-user-id',
          email: email,
          firstName: 'Mock',
          lastName: 'User',
          createdAt: new Date().toISOString()
        },
        token: 'mock-jwt-token-for-development'
      });
    }

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ========== PROFILE ROUTES ==========
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          first_name: 'Mock',
          last_name: 'User',
          bio: 'Mock bio',
          profile_image: null,
          theme: 'light'
        }
      });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, bio, profile_image, created_at, theme')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ========== TASK ROUTES ==========
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    if (!supabase) {
      return res.json({
        success: true,
        tasks: [
          { id: '1', title: 'Sample Task 1', completed: false },
          { id: '2', title: 'Sample Task 2', completed: true }
        ]
      });
    }

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ========== SERVER START ==========
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health endpoint: http://localhost:${PORT}/health`);
  console.log(`✅ API endpoint: http://localhost:${PORT}/api/health`);
  console.log(`✅ Supabase: ${supabase ? 'Connected' : 'Mock mode'}`);
});