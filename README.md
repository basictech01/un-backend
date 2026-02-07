# 🏔️ Uttarakhand Next Backend

A modern GraphQL-powered backend for Uttarakhand's editorial news platform built with TypeScript, Express.js, Apollo Server, and MySQL. Features secure authentication, role-based access, and comprehensive content management workflows.

---

## ✨ Features

- **GraphQL API**: Modern, type-safe GraphQL API with Apollo Server
- **Authentication**: JWT-based authentication for authors and admins
- **Role-based Access**: Granular permissions for authors and administrators
- **Article Management**: Full CRUD operations with approval workflows
- **Editorial Workflow**: Draft → Pending → Approved/Rejected status flow
- **Trending & Views**: Track article popularity and trending content
- **Dockerized**: Complete Docker setup for development and production

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 22 + TypeScript
- **Framework**: Express.js 5
- **API**: Apollo Server 5 (GraphQL)
- **Database**: MySQL 8.4
- **Authentication**: JWT + bcrypt
- **Development**: tsx, nodemon
- **Container**: Docker + Docker Compose

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Node.js 22+](https://nodejs.org/) (for local development)

### Start with Docker

```bash
# Clone and navigate
cd uttrakhand-next/un-backend

# Start services
docker compose up --build

# First time? Initialize database with seed data
docker compose down -v
docker compose up --build
```

The server starts at **http://localhost:3000**

GraphQL Playground: **http://localhost:3000/graphql**

---

## 🗄️ Database Setup

The database is automatically initialized with:
- `01-tables.sql` - Table schema with utf8mb4 support
- `02-seed.sql` - Sample users and articles

**Default seed users:**
- Admin: `admin@uttrakhand.com` / `password123`
- Author: `rajesh@uttrakhand.com` / `password123`

---

## 🔧 Local Development (Without Docker)

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your MySQL credentials

# Start MySQL locally (or use Docker MySQL only)
# Update DB_HOST=localhost in .env

# Run development server
npm run dev
```
---
## 🤝 Contributing
 welcome contributions! Please follow these guidelines:

### Contribution Workflow

1. **Fork** this repository
2. **Create** a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit** your changes
   ```bash
   git commit -m "feat: add amazing feature"
   ```
4. **Push** to your branch
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open** a Pull Request

### Commit Message Convention

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Build/tooling changes

---

## 🐞 Debugging

**View logs:**
```bash
docker compose logs -f uttrakhand-next-backend
```

**Access MySQL:**
```bash
docker exec -it un-mysql-db mysql -u user -ppassword uttrakhand_next
```

**Restart backend only:**
```bash
docker compose restart uttrakhand-next-backend
```

## 📄 License

MIT License - feel free to use this project for learning and development.

---

