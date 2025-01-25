import bcryptjs from 'bcryptjs';
import crypto from 'crypto';

import { generateTokenAndSetCookie } from '../utils/generateTokenAndSetCookie.js';
import { sendPasswordResetEmail, sendResetSuccessEmail, sendVerificationEmail, sendWelcomeEmail } from '../mailtrap/emails.js';
import { User } from '../models/user.model.js';


export const signup = async (req, res ) => {
    const {email, password, name} = req.body;
    try {
        if(!email ||!password ||!name) {
            throw new Error("All fields are required");
        }

        const userAlreadyExists = await User.findOne({email});
        console.log("userAlreadyExists", userAlreadyExists);
        if(userAlreadyExists) {
            return res.status(400).json({success:false, message: "User already exists"});
        }

        const hashedPassword = await bcryptjs.hash(password, 10);
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();


        console.log("Generated verification token:", verificationToken);


        const user = new User ({
            email,
            password: hashedPassword,
            name,
            verificationToken,
            verificationTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        })

        await user.save();
        console.log("Sending verification email to:", user.email);


        //jwt token
        generateTokenAndSetCookie(res,user._id);

        await sendVerificationEmail(user.email, user.verificationToken);

        res.status(201).json({
            success: true, 
            message: "User registered successfully", 
            user: {
                ...user._doc,
                password: undefined
            }
        });
    } catch (error) {
        res.status(400).json({success: false, message: error.message});
        
    }
};

export const verifyEmail = async (req, res) => {
    const { code } = req.body;
    const trimmedCode = code.trim(); // Ensure no extra spaces
    console.log("Submitted verification code:", trimmedCode);

    try {
        const user = await User.findOne({
            verificationToken: trimmedCode, // Use trimmed code
            verificationTokenExpiresAt: { $gt: Date.now() } // Check expiration
        });

        if (!user) {
            console.log("Verification failed: Invalid or expired token");
            return res.status(400).json({ success: false, message: "Invalid or expired verification token" });
        }

        // Update user's verification status
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpiresAt = undefined;

        await user.save();
        console.log("User verified and updated:", user);

        // Send welcome email
        await sendWelcomeEmail(user.email, user.name);

        res.status(200).json({
            success: true,
            message: "Email verified successfully",
            user: {
                ...user._doc,
                password: undefined
            }
        });
    } catch (error) {
        console.error("Error during email verification:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


export const login = async (req, res ) => {
    const {email, password} = req.body;
    try {
        const user = await User.findOne({email});
        if(!user) {
            return res.status(400).json({success: false, message: "Invalid credentials"});
        }
        const isPasswordValid = await bcryptjs.compare(password, user.password);
        if(!isPasswordValid) {
            return res.status(400).json({success: false, message: "Invalid credentials"});
        }

        generateTokenAndSetCookie(res, user._id);

        user.lastlogin = new Date();
        await user.save();

        res.status(200).json({
            success: true,
            message: "Logged in Successfully",
            user: {
                ...user._doc,
                lastLogin: user.lastlogin, 
                password: undefined,
            },
        });
    } catch (error) {
        console.log("error in login", error);
        res.status(200).json({success: false, message: error.message})
        
    }
};

export const logout = async (req, res ) => {
    res.clearCookie("token");
    res.status(200).json({success: true, message: "Logged out successfully"})
};

export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({email});

        if(!user) {
            return res.status(400).json({success: false, message: "User not found"});
        }
        const resetToken = crypto.randomBytes(20).toString("hex");
        const resetTokenExpiresAt = Date.now() + 1 * 60 * 60 * 1000; // 1 hour

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpiresAt = resetTokenExpiresAt;
        await user.save();

        // send email
        await sendPasswordResetEmail(user.email, `${process.env.CLIENT_URL}/reset-password/${resetToken}`);
        res.status(200).json({sucess: true, message: "Password reset link sent to your email" });
    } catch (error) {
        console.log("error in forgotPassword", error);
        res.status(500).json({sucess: false, message: error.message});

        
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpiresAt: {$gt: Date.now()}
        });

        if(!user) {
            return res.status(400).json({success: false, message: "Invalid or expired reset token"});
        }

        const hashedPassword = await bcryptjs.hash(password, 10);

        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpiresAt = undefined;
        await user.save();

        await sendResetSuccessEmail(user.email);

        res.status(200).json({success: true, message: "Password reset successful"});
    } catch (error) {
        console.log("error in resetPassword", error);
        res.status(400).json({success: false, message: error.message});
        
    }
};

export const checkAuth = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if(!user) {
            return res.status(401).json({success: false, message: "User not found"});
        }

        res.status(200).json({success: true, user});

    } catch (error) {
        console.log("error in checkAuth", error);
        res.status(500).json({success: false, message: error.message});
        
    }
}