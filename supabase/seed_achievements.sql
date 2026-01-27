-- Seed initial achievements
-- Run this after creating the achievements table

INSERT INTO achievements (id, name, description, category, requirement_type, requirement_target, reward_soft_currency, reward_premium_currency, reward_title, icon, rarity) VALUES

-- Battle Achievements
('first_victory', 'First Blood', 'Win your first battle', 'battle', 'battles_won', 1, 50, 0, 'Novice Sorcerer', '⚔️', 'common'),
('win_10_battles', 'Battle Veteran', 'Win 10 battles', 'battle', 'battles_won', 10, 200, 0, NULL, '🏆', 'common'),
('win_50_battles', 'War Hero', 'Win 50 battles', 'battle', 'battles_won', 50, 500, 10, 'Battle Master', '👑', 'rare'),
('win_100_battles', 'Legendary Warrior', 'Win 100 battles', 'battle', 'battles_won', 100, 1000, 25, 'Legendary Sorcerer', '💫', 'epic'),
('win_250_battles', 'Unstoppable Force', 'Win 250 battles', 'battle', 'battles_won', 250, 2500, 50, 'Unstoppable', '🌟', 'legendary'),

-- PvP Achievements
('first_pvp_win', 'Worthy Opponent', 'Win your first PvP match', 'pvp', 'pvp_wins', 1, 100, 0, NULL, '⚔️', 'common'),
('win_10_pvp', 'PvP Adept', 'Win 10 PvP matches', 'pvp', 'pvp_wins', 10, 300, 5, NULL, '🎯', 'common'),
('win_50_pvp', 'Arena Champion', 'Win 50 PvP matches', 'pvp', 'pvp_wins', 50, 750, 15, 'Arena Champion', '🏅', 'rare'),
('ranked_1500', 'Rising Star', 'Reach 1500 rating in Ranked PvP', 'pvp', 'rating_reached', 1500, 500, 10, NULL, '⭐', 'rare'),
('ranked_1800', 'Elite Duelist', 'Reach 1800 rating in Ranked PvP', 'pvp', 'rating_reached', 1800, 1000, 25, 'Elite Duelist', '💎', 'epic'),
('win_streak_5', 'On Fire', 'Win 5 battles in a row', 'pvp', 'win_streak', 5, 300, 5, NULL, '🔥', 'rare'),
('win_streak_10', 'Domination', 'Win 10 battles in a row', 'pvp', 'win_streak', 10, 750, 20, 'Dominator', '🌋', 'epic'),

-- Character Collection
('unlock_3_characters', 'Squad Leader', 'Unlock 3 different characters', 'collection', 'characters_unlocked', 3, 100, 0, NULL, '👥', 'common'),
('unlock_5_characters', 'Collector', 'Unlock 5 different characters', 'collection', 'characters_unlocked', 5, 250, 5, NULL, '📚', 'common'),
('unlock_all_characters', 'Master Collector', 'Unlock all characters', 'collection', 'characters_unlocked', 9, 1500, 50, 'Master Collector', '🎭', 'legendary'),
('max_level_character', 'Power Leveler', 'Get a character to max level', 'collection', 'max_level_characters', 1, 300, 10, NULL, '📈', 'rare'),
('limit_break_5', 'Breaking Limits', 'Perform 5 limit breaks', 'collection', 'limit_breaks', 5, 400, 10, NULL, '💪', 'rare'),

-- Progression
('reach_level_10', 'Apprentice', 'Reach account level 10', 'progression', 'account_level', 10, 150, 0, NULL, '📖', 'common'),
('reach_level_25', 'Journeyman', 'Reach account level 25', 'progression', 'account_level', 25, 400, 10, 'Journeyman', '🎓', 'rare'),
('reach_level_50', 'Master Sorcerer', 'Reach account level 50', 'progression', 'account_level', 50, 1000, 25, 'Master Sorcerer', '🧙', 'epic'),

-- Economy
('spend_1000_soft', 'Big Spender', 'Spend 1000 soft currency', 'economy', 'soft_spent', 1000, 100, 0, NULL, '💰', 'common'),
('gacha_10_pulls', 'Lucky Streak', 'Perform 10 gacha pulls', 'economy', 'gacha_pulls', 10, 200, 5, NULL, '🎰', 'common'),
('gacha_50_pulls', 'Gambling Addict', 'Perform 50 gacha pulls', 'economy', 'gacha_pulls', 50, 500, 20, NULL, '🎲', 'rare'),

-- Story/Campaign
('complete_chapter_1', 'Story Seeker', 'Complete Chapter 1', 'story', 'chapters_completed', 1, 200, 5, 'Story Seeker', '📜', 'common'),
('complete_all_missions', 'Mission Master', 'Complete all available missions', 'missions', 'missions_completed', 100, 1000, 25, 'Mission Master', '✅', 'epic'),

-- Daily Engagement
('login_streak_7', 'Dedicated', 'Login 7 days in a row', 'daily', 'login_streak', 7, 300, 5, NULL, '📅', 'common'),
('login_streak_30', 'Committed', 'Login 30 days in a row', 'daily', 'login_streak', 30, 1000, 25, 'Committed Player', '🗓️', 'rare'),
('login_streak_100', 'Devoted', 'Login 100 days in a row', 'daily', 'login_streak', 100, 3000, 100, 'Devoted One', '📆', 'legendary'),
('total_logins_50', 'Frequent Visitor', 'Login a total of 50 times', 'daily', 'total_logins', 50, 250, 10, NULL, '🚪', 'common'),

-- Special/Hidden
('perfect_victory', 'Flawless', 'Win a battle without taking damage', 'special', 'perfect_victories', 1, 500, 15, 'Flawless Victor', '✨', 'epic'),
('clutch_victory', 'Miracle Worker', 'Win a battle with only 1 character remaining at 1 HP', 'special', 'clutch_victories', 1, 500, 15, NULL, '🙏', 'epic');
