-- =====================================================
-- Uttarakhand Next - Seed Data
-- =====================================================

-- =====================================================
-- Sample Users (Admins + Authors)
-- Password for all: "password123" (hashed)
-- =====================================================
INSERT INTO users (name, email, password_hash, bio, profession, role, is_active) VALUES
('Admin User', 'admin@uttrakhand.com', '$2b$10$hfUrQD2IYmHiuDe.3uy.v.FMaDyO.JgwqqVN5ngLDvsgyFCoocFk6', 'Platform administrator', 'Administrator', 'admin', TRUE),
('Rajesh Kumar', 'rajesh@uttrakhand.com', '$2b$10$hfUrQD2IYmHiuDe.3uy.v.FMaDyO.JgwqqVN5ngLDvsgyFCoocFk6', 'Senior journalist covering Uttarakhand news', 'Journalist', 'author', TRUE),
('Priya Sharma', 'priya@uttrakhand.com', '$2b$10$hfUrQD2IYmHiuDe.3uy.v.FMaDyO.JgwqqVN5ngLDvsgyFCoocFk6', 'Environmental reporter', 'Reporter', 'author', TRUE),
('Amit Singh', 'amit@uttrakhand.com', '$2b$10$hfUrQD2IYmHiuDe.3uy.v.FMaDyO.JgwqqVN5ngLDvsgyFCoocFk6', 'Political correspondent', 'Correspondent', 'author', TRUE);

-- =====================================================
-- Sample Articles
-- =====================================================
INSERT INTO articles (author_id, title, excerpt, content, section, subsections, cover_image, status, published_at) VALUES
(2, 'Tourism Boom in Uttarakhand Hills', 'Record number of tourists visit hill stations this season', 'Uttarakhand hill stations witnessed unprecedented tourist footfall this season. Popular destinations like Nainital, Mussoorie, and Ranikhet reported 40% increase in visitors...', 'NEWS', '["TRAVEL","ECONOMY"]', '/images/tourism-boom.jpg', 'approved', NOW()),
(2, 'Climate Change Impact on Himalayan Glaciers', 'Scientists warn of accelerating glacier melting', 'A recent study by Indian Institute of Science highlights alarming glacier retreat rates in Uttarakhand Himalayas. The report suggests immediate action needed to preserve water sources...', 'ENVIRONMENT', '["CLIMATE","SCIENCE"]', '/images/glacier-study.jpg', 'approved', NOW()),
(3, 'New Infrastructure Projects Announced', 'State government unveils development roadmap', 'The Uttarakhand government announced major infrastructure projects worth 5000 crores including new highways, hospitals, and educational institutions across the state...', 'POLITICS', '["DEVELOPMENT","INFRASTRUCTURE"]', '/images/infrastructure.jpg', 'approved', NOW()),
(3, 'Traditional Handicrafts Gain Global Recognition', 'Uttarakhand artisans showcase work internationally', 'Local artisans from Almora and Bageshwar showcased traditional handicrafts at the International Trade Fair in Delhi, receiving overwhelming response from global buyers...', 'CULTURE', '["ART","TRADITION"]', '/images/handicrafts.jpg', 'approved', NOW()),
(4, 'Education Reform Bill Under Review', 'Proposed changes to state education policy', 'The state assembly is reviewing a comprehensive education reform bill aimed at improving quality of education in government schools and colleges across Uttarakhand...', 'EDUCATION', '["POLICY","REFORM"]', '/images/education.jpg', 'pending', NULL),
(4, 'Wildlife Conservation Success Story', 'Tiger population shows healthy growth', 'Latest census data reveals a 20% increase in tiger population in Corbett National Park and Rajaji Tiger Reserve, marking a significant conservation milestone...', 'ENVIRONMENT', '["WILDLIFE","CONSERVATION"]', '/images/tigers.jpg', 'draft', NULL),
(2, 'Tech Startup Ecosystem Emerges in Dehradun', 'Young entrepreneurs drive innovation', 'Dehradun is witnessing the emergence of a vibrant tech startup ecosystem with over 50 new companies registered in the past year, focusing on sustainable tourism and agritech...', 'BUSINESS', '["TECHNOLOGY","STARTUPS"]', '/images/startups.jpg', 'approved', NOW());

-- =====================================================
-- Sample Article Views (for trending)
-- =====================================================
INSERT INTO article_views (article_id, views, last_viewed_at) VALUES
(1, 15420, NOW()),
(2, 12350, NOW()),
(3, 8900, NOW()),
(4, 6750, NOW()),
(7, 5200, NOW());
