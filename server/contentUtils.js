const getPollDisplayTitle = (title) => title;

const sortRankings = (items = []) =>
  [...items].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

const normalizeImageUrl = (url = '') => url;

module.exports = { getPollDisplayTitle, sortRankings, normalizeImageUrl };
