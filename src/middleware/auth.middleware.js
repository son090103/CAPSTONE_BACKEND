const jwt = require("jsonwebtoken");
const db = require("../../models");
/** @type {import("sequelize").ModelStatic<import("sequelize").Model>} */
const User = db.User;
const Role = db.Role;
module.exports.authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - No token provided",
            });
        }
        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                success: false,
                message: "Invalid token format",
            });
        }
        const token = parts[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);
        const user = await User.findOne({
            where: {
                id: decoded.id,
            },
            attributes: {
                exclude: ["password"],
            },
            include: [
                {
                    model: Role,
                    as: "role",
                },
            ],
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }
        res.locals.user = user;
        res.locals.exp = decoded.exp;
        console.log("Authentication success");
        next();
    } catch (error) {
        console.error("❌ Auth Error:", error.message);

        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token expired",
            });
        }
        if (error.name === "JsonWebTokenError") {
            return res.status(403).json({
                success: false,
                message: "Invalid token",
            });
        }
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports.authorizeRoles = (...allowedRoleNames) => {
    return (req, res, next) => {
        const user = res.locals.user;
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const roleName = user?.role?.roleCode?.toString().toLowerCase();
        if (!roleName) {
            return res.status(403).json({
                success: false,
                message: "Role not found",
            });
        }
        const allowedRoles = allowedRoleNames.map((role) =>
            role.toString().toLowerCase()
        );
        if (!allowedRoles.includes(roleName)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden - You do not have permission",
            });
        }
        next();
    };
};

// Cho cac route ho tro ca khach vang lai va khach da dang nhap (vi du chatbot).
// Token khong hop le khong duoc bo qua, tranh de client nghi rang minh da dang nhap.
module.exports.optionalAuthenticate = async (req, res, next) => {
    if (!req.headers.authorization) return next();
    return module.exports.authenticate(req, res, next);
};
