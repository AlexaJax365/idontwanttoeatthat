
const { updateUserPreferences } = require('../services/aiService');

exports.rejectCuisine = async (req, res) => {
  try {
    const { userId, rejectedCuisines } = req.body;
    const updatedPrefs = await updateUserPreferences(userId, { rejectedCuisines });
    res.status(200).json({ success: true, preferences: updatedPrefs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
