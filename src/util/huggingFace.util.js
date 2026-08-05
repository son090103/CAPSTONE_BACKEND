let HfInference;
let loadAttempted = false;

const getHfInference = (token) => {
  if (!token) return null;

  if (!loadAttempted) {
    loadAttempted = true;
    try {
      ({ HfInference } = require("@huggingface/inference"));
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
      console.warn(
        "Không tìm thấy @huggingface/inference; tạm bỏ qua chức năng tự động dịch.",
      );
    }
  }

  return HfInference ? new HfInference(token.trim()) : null;
};

module.exports = { getHfInference };
