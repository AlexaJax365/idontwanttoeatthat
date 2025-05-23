
let userPreferences = {};

exports.updateUserPreferences = async (userId, updates) => {
  if (!userPreferences[userId]) {
    userPreferences[userId] = { rejectedCuisines: [], acceptedCuisines: [] };
  }

  userPreferences[userId].rejectedCuisines = [
    ...new Set([...userPreferences[userId].rejectedCuisines, ...updates.rejectedCuisines])
  ];

  return userPreferences[userId];
};
