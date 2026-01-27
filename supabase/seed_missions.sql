-- Seed initial missions
-- Run this after creating the missions table

-- Daily Missions (Reset every 24 hours)
INSERT INTO missions (type, condition, condition_value, title, description, target, reward_soft, reward_premium, reward_shard_character_id, reward_shard_amount) VALUES
('daily', 'battles_won', NULL, 'Daily Victor', 'Win 3 battles today', 3, 50, 0, NULL, 0),
('daily', 'battles_played', NULL, 'Battle Participant', 'Complete 5 battles today', 5, 40, 0, NULL, 0),
('daily', 'pvp_battles_won', NULL, 'PvP Daily', 'Win 2 PvP matches today', 2, 75, 2, NULL, 0),
('daily', 'abilities_used', NULL, 'Ability Master', 'Use 15 abilities in battles today', 15, 30, 0, NULL, 0),
('daily', 'damage_dealt', NULL, 'Heavy Hitter', 'Deal 500 total damage today', 500, 35, 0, NULL, 0),
('daily', 'login', NULL, 'Daily Login', 'Login to the game', 1, 20, 1, NULL, 0),
('daily', 'gacha_pulls', NULL, 'Try Your Luck', 'Perform 1 gacha pull today', 1, 25, 1, NULL, 0),
('daily', 'character_xp_gained', NULL, 'Training Day', 'Earn 200 character XP today', 200, 40, 0, NULL, 0);

-- Weekly Missions (Reset every 7 days)
INSERT INTO missions (type, condition, condition_value, title, description, target, reward_soft, reward_premium, reward_shard_character_id, reward_shard_amount) VALUES
('weekly', 'battles_won', NULL, 'Weekly Champion', 'Win 20 battles this week', 20, 200, 5, NULL, 0),
('weekly', 'pvp_battles_won', NULL, 'PvP Warrior', 'Win 10 PvP matches this week', 10, 300, 10, NULL, 0),
('weekly', 'perfect_victories', NULL, 'Flawless Week', 'Win 5 battles without taking damage this week', 5, 250, 8, NULL, 0),
('weekly', 'login_days', NULL, 'Weekly Attendance', 'Login 5 days this week', 5, 150, 5, NULL, 0),
('weekly', 'damage_dealt', NULL, 'Destruction', 'Deal 5000 total damage this week', 5000, 175, 5, NULL, 0),
('weekly', 'gacha_pulls', NULL, 'Gacha Enthusiast', 'Perform 5 gacha pulls this week', 5, 100, 5, NULL, 0),
('weekly', 'abilities_used', NULL, 'Technique Mastery', 'Use 100 abilities this week', 100, 125, 3, NULL, 0),
('weekly', 'characters_leveled', NULL, 'Power Up', 'Level up any character 3 times this week', 3, 200, 5, NULL, 0),
('weekly', 'story_nodes_completed', NULL, 'Story Progress', 'Complete 10 story nodes this week', 10, 180, 5, NULL, 0),
('weekly', 'soft_currency_earned', NULL, 'Wealthy', 'Earn 1000 soft currency this week', 1000, 100, 5, NULL, 0);

-- Limited Time Missions (Special events, no end date for now)
INSERT INTO missions (type, condition, condition_value, title, description, target, reward_soft, reward_premium, reward_shard_character_id, reward_shard_amount) VALUES
('limited', 'battles_won', 'yuji', 'Yuji Showcase', 'Win 10 battles using Yuji Itadori', 10, 300, 10, 1, 5),
('limited', 'battles_won', 'megumi', 'Megumi Mastery', 'Win 10 battles using Megumi Fushiguro', 10, 300, 10, 2, 5),
('limited', 'battles_won', 'nobara', 'Nobara Expert', 'Win 10 battles using Nobara Kugisaki', 10, 300, 10, 3, 5),
('limited', 'battles_won', 'gojo', 'Gojo Domination', 'Win 10 battles using Satoru Gojo', 10, 500, 20, 4, 10),
('limited', 'battles_won', 'nanami', 'Nanami Professional', 'Win 10 battles using Kento Nanami', 10, 300, 10, 5, 5),
('limited', 'perfect_victories', NULL, 'Perfectionist', 'Win 10 battles without taking damage', 10, 500, 15, NULL, 0),
('limited', 'pvp_rating', NULL, 'Rank Up', 'Reach 1500 PvP rating', 1500, 750, 25, NULL, 0),
('limited', 'win_streak', NULL, 'Unstoppable', 'Win 5 battles in a row', 5, 400, 15, NULL, 0),
('limited', 'all_characters_unlocked', NULL, 'Complete Collection', 'Unlock all 9 characters', 9, 1000, 50, NULL, 0),
('limited', 'total_battles', NULL, 'Battle Veteran', 'Complete 100 total battles', 100, 600, 20, NULL, 0),
('limited', 'damage_dealt_single_battle', NULL, 'One Punch', 'Deal 300+ damage in a single battle', 300, 350, 10, NULL, 0),
('limited', 'abilities_used_single_battle', NULL, 'Ability Spam', 'Use 20+ abilities in a single battle', 20, 300, 8, NULL, 0),
('limited', 'story_chapter_complete', '1', 'Chapter 1 Complete', 'Complete all of Chapter 1', 1, 250, 10, NULL, 0),
('limited', 'story_chapter_complete', '2', 'Chapter 2 Complete', 'Complete all of Chapter 2', 1, 400, 15, NULL, 0),
('limited', 'account_level', NULL, 'Level 25 Reached', 'Reach account level 25', 25, 500, 20, NULL, 0);
