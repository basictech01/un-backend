-- =====================================================
-- Uttarakhand Next – Editorial News Platform Database
-- =====================================================

-- =====================================================
-- 0. Database Config (InnoDB, utf8mb4)
-- =====================================================
ALTER DATABASE uttrakhand_next
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- =====================================================
-- 1. Users (Authors + Admins)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,

  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,

  bio TEXT,
  profession VARCHAR(100),
  profile_photo VARCHAR(255),

  role ENUM('author','admin')
       NOT NULL DEFAULT 'author',

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. Articles (Core Editorial Content)
-- =====================================================
CREATE TABLE IF NOT EXISTS articles (
  id INT AUTO_INCREMENT PRIMARY KEY,

  author_id INT NOT NULL,

  title VARCHAR(255) NOT NULL,
  excerpt TEXT,
  content LONGTEXT NOT NULL,

  -- Editorial identity (validated at APP level)
  section VARCHAR(50) NOT NULL,

  -- Subsections = FIXED editorial tags (JSON array)
  -- Example: ["CHARISMA","DIASPORA"]
  subsections JSON NOT NULL,

  cover_image VARCHAR(255),

  status ENUM('draft','pending','approved','rejected')
         NOT NULL DEFAULT 'draft',

  rejection_reason TEXT,

  published_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_section (section),
  INDEX idx_status (status),
  INDEX idx_author (author_id),
  INDEX idx_published (published_at),
  INDEX idx_created (created_at),

  CONSTRAINT fk_articles_author
    FOREIGN KEY (author_id)
    REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. Article Views (Trending / Popularity)
-- =====================================================
CREATE TABLE IF NOT EXISTS article_views (
  article_id INT PRIMARY KEY,
  views BIGINT NOT NULL DEFAULT 0,
  last_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_views_article
    FOREIGN KEY (article_id)
    REFERENCES articles(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER USER 'user'@'%'
IDENTIFIED WITH caching_sha2_password
BY 'password';

FLUSH PRIVILEGES;
