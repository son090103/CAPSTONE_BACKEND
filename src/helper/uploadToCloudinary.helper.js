const cloudinary = require("../config/cloudinary.config");
const streamifier = require("streamifier");

const uploadToCloudinary = (fileBuffer, folder, isPdf = false) => {
    return new Promise((resolve, reject) => {
        const options = { folder: folder || "WDP301" };
        if (isPdf) {
            options.resource_type = "raw";
            options.format = "pdf";
        }
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        streamifier.createReadStream(fileBuffer).pipe(stream);
    });
};

module.exports = { uploadToCloudinary };
