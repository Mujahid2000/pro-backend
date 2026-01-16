import {Router } from "express";
import { changeCurrentPassword, getCurrentUserProfile, getUserChannelProfile, getWatchHistory, refreshToken, registerUser, updateAccountDetails, updateAvatarUser, updateCoverImageUser } from "../controllers/user.controller.js";
import {upload}  from "../middlewares/multer.middleware.js"
import {loginUser, logoutUser} from "../controllers/user.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";
const router = Router();

router.route('/register').post(
    upload.fields([
        {name: 'avatar', maxCount: 1},
        {name: 'coverImage', maxCount: 1}
    ]), 
    registerUser
)

router.route('/login').post(loginUser)

//secure route
router.route('/logout').post(verifyJWT,  logoutUser)
router.route('/refresh-token').post(refreshToken)
router.route('/change-password').post(verifyJWT,  changeCurrentPassword)
router.route('/current-user').get(verifyJWT, getCurrentUserProfile)
router.route('/update-account').patch(verifyJWT, updateAccountDetails)
router.route('/update-avatar').patch(verifyJWT, upload.single('avatar'), updateAvatarUser)
router.route('/update-cover-image').patch(verifyJWT, upload.single('coverImage'), updateCoverImageUser)
router.route('/c/:username').get(verifyJWT, getUserChannelProfile)
router.route('/watchHistory').get(verifyJWT, getWatchHistory);


export default router;
