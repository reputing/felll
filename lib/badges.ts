// Achievements, computed from a member's own stats (no external API). Pure, so
// the profile page can render them straight from memberStats().

export interface Badge {
  key: string;
  label: string;
  desc: string;
  icon: string;
  earned: boolean;
}

type StatsLike = {
  completed: number;
  entries: number;
  episodes: number;
  hours: number;
  rated: number;
  favs: number;
  streak: number;
  comments: number;
};

export function computeBadges(s: StatsLike): Badge[] {
  const defs: [string, string, string, string, boolean][] = [
    ["first", "First finish", "Completed your first anime", "🌸", s.completed >= 1],
    ["finisher", "Finisher", "Completed 10 shows", "✅", s.completed >= 10],
    ["completionist", "Completionist", "Completed 50 shows", "🏆", s.completed >= 50],
    ["century", "Century", "Watched 100 episodes", "💯", s.episodes >= 100],
    ["marathon", "Marathoner", "100 hours watched", "🏃", s.hours >= 100],
    ["devoted", "Devoted", "500 hours watched", "🌙", s.hours >= 500],
    ["critic", "Critic", "Rated 25 shows", "⭐", s.rated >= 25],
    ["tastemaker", "Tastemaker", "10 favourites", "💖", s.favs >= 10],
    ["streak7", "On a roll", "7-day watch streak", "🔥", s.streak >= 7],
    ["streak30", "Unstoppable", "30-day watch streak", "⚡", s.streak >= 30],
    ["chatterbox", "Chatterbox", "Left 25 comments", "💬", s.comments >= 25],
    ["collector", "Collector", "100 titles in your box", "📚", s.entries >= 100],
  ];
  return defs.map(([key, label, desc, icon, earned]) => ({ key, label, desc, icon, earned }));
}
