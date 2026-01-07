const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'taskly-secret-2024';

let users = [];
let tasks = [];

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// AUTH
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'Invalid email or password' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, token, user: userWithoutPassword });
});

app.post('/api/auth/register', (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    if (users.some(u => u.email === email)) return res.status(400).json({ success: false, message: 'User exists' });
    const newUser = {
        id: users.length + 1,
        firstName, lastName, email, password,
        profilePicture: "https://via.placeholder.com/200",
        bio: "", theme: "light",
        joinDate: new Date().toISOString()
    };
    users.push(newUser);
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ success: true, token, user: userWithoutPassword });
});

// TASKS
app.get('/api/tasks', authenticate, (req, res) => {
    const userTasks = tasks.filter(task => task.userId === req.userId);
    res.json({ success: true, tasks: userTasks });
});

app.post('/api/tasks', authenticate, (req, res) => {
    const newTask = {
        id: tasks.length + 1,
        userId: req.userId,
        ...req.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    tasks.push(newTask);
    res.status(201).json({ success: true, task: newTask });
});

app.put('/api/tasks/:id', authenticate, (req, res) => {
    const taskId = parseInt(req.params.id);
    const taskIndex = tasks.findIndex(t => t.id === taskId && t.userId === req.userId);
    if (taskIndex === -1) return res.status(404).json({ success: false, message: 'Task not found' });
    tasks[taskIndex] = { ...tasks[taskIndex], ...req.body, updatedAt: new Date().toISOString() };
    res.json({ success: true, task: tasks[taskIndex] });
});

app.delete('/api/tasks/:id', authenticate, (req, res) => {
    const taskId = parseInt(req.params.id);
    const taskIndex = tasks.findIndex(t => t.id === taskId && t.userId === req.userId);
    if (taskIndex === -1) return res.status(404).json({ success: false, message: 'Task not found' });
    tasks.splice(taskIndex, 1);
    res.json({ success: true, message: 'Task deleted' });
});

// PROFILE
app.get('/api/profile', authenticate, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const { password, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
});

app.put('/api/profile', authenticate, (req, res) => {
    const userIndex = users.findIndex(u => u.id === req.userId);
    if (userIndex === -1) return res.status(404).json({ success: false, message: 'User not found' });
    const { password, ...updateData } = req.body;
    users[userIndex] = { ...users[userIndex], ...updateData };
    const { password: _, ...userWithoutPassword } = users[userIndex];
    res.json({ success: true, user: userWithoutPassword });
});

// STATS
app.get('/api/stats', authenticate, (req, res) => {
    const userTasks = tasks.filter(task => task.userId === req.userId);
    const stats = {
        total: userTasks.length,
        pending: userTasks.filter(t => t.status === 'pending').length,
        completed: userTasks.filter(t => t.status === 'completed').length,
        archived: userTasks.filter(t => t.status === 'archived').length
    };
    res.json({ success: true, stats });
});

// HOME - EXACTLY AS YOU WANTED
app.get('/', (req, res) => {
    res.json({ 
        message: "Taskly Backend API", 
        status: "running", 
        version: "1.0.0", 
        database: "mock-mode" 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));