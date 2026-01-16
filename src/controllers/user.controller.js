import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadCloundinary } from "../utils/FileUpload.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Error generating tokens:", error);
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from forntend
  const { userName, email, fullName, password } = req.body;
  //    console.log(userName, email, fullName, password)
  // console.log(req.body)
  // validation - not empty
  if (
    [userName, email, fullName, password].some((field) => {
      field?.trim() === "";
    })
  ) {
    throw new ApiError(400, "All fields are required");
  }
  // check if user already exists
  const existingUser = await User.findOne({
    $or: [{ userName: userName.toLowerCase() }, { email: email.toLowerCase() }],
  });
  // check if user already exist: username, email
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  // check for images, check for avatar
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;
  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0]?.path;
  }

  // console.log(avatarLocalPath, coverImageLocalPath)
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }
  // // upload then to cloudinary , avatar
  const avatar = await uploadCloundinary(avatarLocalPath);
  const coverImage = await uploadCloundinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar is required");
  }
  // create object - create entry in db
  const user = await User.create({
    userName: userName.toLowerCase(),
    email,
    fullName,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  // remove password and refresh token field from response
  // check for user creation
  if (!createdUser) {
    throw new ApiError(500, "User creation failed");
  }
  // return response
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // req.body => data
  // username or email
  // find the user
  // password check
  // access and refresh token
  // send cookie

  const { userName, email, password } = req.body;
  if (!userName && !email) {
    throw new ApiError(400, "Username and email is required");
  }
  const user = await User.findOne({
    $or: [
      { userName: userName?.toLowerCase() },
      { email: email?.toLowerCase() },
    ],
  });
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }
  const isPasswordMatched = await user.isPasswordCorrect(password);
  if (!isPasswordMatched) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  // console.log(accessToken, refreshToken)
  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: undefined } },
    { new: true }
  );
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken =
      req.cookies.refreshToken || req.body.refreshToken;
    if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorized Request");
    }

    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token expired or used");
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    const cookieOptions = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", newRefreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          {
            user: user,
            accessToken,
            refreshToken: newRefreshToken,
          },
          "User logged in successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(currentPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Current password is incorrect");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUserProfile = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User profile fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateAvatarUser = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar image is required");
  }
  const avatar = await uploadCloundinary(avatarLocalPath);

  if (!avatar) {
    throw new ApiError(500, "Error while uploading avatar image");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});

const updateCoverImageUser = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image is required");
  }
  const coverImage = await uploadCloundinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(500, "Error while uploading cover image");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) =>{
    const {userName} = req.params;

    if(!userName || userName.trim() === ""){
        throw new ApiError(400, "Username is required");
    }

    const channel = await User.aggregate([
        { $match: { userName: userName.toLowerCase() } },
        { $lookup: {
            from: 'subscriptions',
            localField: '_id',
            foreignField: 'channel',
            as: 'subscribers'
        }},
        { $lookup: {
            from: 'subscriptions',
            localField: '_id',
            foreignField: 'subscriber',
            as: 'subscribedTo'
        }},
        { $addFields: {
            totalSubscribers: { $size: '$subscribers' },
            totalSubscribedTo: { $size: '$subscribedTo' },
            isSubscribed: {
              $cond: {
                if: {
                  $in: [req.user._id , '$subscribers.subscriber']
                },
                then: true,
                else: false
              }
            }
        }},
        { $project: {
          fullName: 1,
          userName: 1,
          totalSubscribedTo: 1,
          totalSubscribers: 1,
          isSubscribed: 1,
          avatar: 1,
          coverImage: 1,
          email: 1,
        }}
    ])

    if(!channel || channel.length === 0){
        throw new ApiError(404, "Channel not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, channel[0], "Channel profile fetched successfully"));
});

const getWatchHistory = asyncHandler(async (req, res) => {
  // To be implemented
  const userId = req.user._id;
  // Fetch watch history from the database based on userId
  const watchHistory = User.aggregate([
    { $match: new mongoose.Types.ObjectId(userId) },
    { $lookup: {
        from: 'videos',
        localField: 'watchHistory',
        foreignField: '_id',
        as: 'watchedVideos',
        pipeline: [
          { $lookup: {
              from: 'users',
              localField: 'owner',
              foreignField: '_id',
              as: 'owner',
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    userName: 1,
                    avatar: 1
                  }
                }
              ]
          }},
          { $addFields: {
            owner: { $first: '$owner'}
          }}
        ],
    }}
  ])

  return res
    .status(200)
    .json(new ApiResponse(200, watchHistory[0].watchHistory, "Watch history fetched successfully"));
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshToken,
  changeCurrentPassword,
  getCurrentUserProfile,
  updateAccountDetails,
  updateAvatarUser,
  updateCoverImageUser,
  getUserChannelProfile,
  getWatchHistory
};
