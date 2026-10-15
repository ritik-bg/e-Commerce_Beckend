// middleware/authMiddleware.js

export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // 1. Check if user information exists (passed from your authentication middleware)
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized. Please log in first." });
        }

        // 2. Check if the user's role is allowed to access this route
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `Forbidden: Role '${req.user.role}' does not have permission to perform this action.` 
            });
        }
        next();
    };
};