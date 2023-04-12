const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const intitializedBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(4000, () => {
      console.log(`Server is running at http://localhost:4000`);
    });
  } catch (error) {
    console.log("DB Error = " + error.message);
    process.exit(1);
  }
};
intitializedBAndServer();

// Middleware function to authenticate token
const authToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtTokenAdd;
  if (authHeader !== undefined) {
    jwtTokenAdd = authHeader.split(" ")[1];
  }
  if (jwtTokenAdd === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtTokenAdd, "SECRET_KEY", (err, payload) => {
      if (err) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API1 Register Api
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserPresent = `
    SELECT *
    FROM user
    WHERE username='${username}';`;
  const userResp = await db.get(checkUserPresent);

  if (userResp === undefined) {
    if (request.body.password.length > 6) {
      const hashedPassword = await bcrypt.hash(request.body.password, 10);
      const addUser = `
            INSERT INTO
            user(username, password, name, gender)
            VALUES('${username}', '${hashedPassword}','${name}','${gender}')`;
      await db.run(addUser);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2 Login Api
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserPresent = `
    SELECT *
    FROM user
    WHERE username='${username}';`;
  const userResp = await db.get(checkUserPresent);
  if (userResp === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, userResp.password);
    if (isPasswordValid === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.send(400);
      response.send("Invalid password");
    }
  }
});

//API3 (Returns the latest tweets of people whom the user follows. Return 4 tweets at a time)
app.get("/user/tweets/feed/", authToken, async (request, response) => {
  const getTweets = `
        SELECT user.username as username,
        tweet.tweet as tweet,
        tweet.date_time as dateTime
        FROM tweet
        INNER JOIN user
        ON tweet.user_id = user.user_id
        ORDER BY tweet.date_time DESC
        LIMIT 4;`;
  const dbResponse = await db.all(getTweets);
  response.send(dbResponse);
});

// API4 (Returns the list of all names of people whom the user follows)
app.get("/user/following/", authToken, async (request, response) => {
  const getUserNames = `
        SELECT user.name as name
        FROM user
        INNER JOIN follower
        ON user.user_id = follower.follower_user_id;`;
  const dbResponse = await db.all(getUserNames);
  response.send(dbResponse);
});

// API5 (Returns the list of all names of people who follows the user)
app.get("/user/followers/", authToken, async (request, response) => {
  //   let { username } = request;
  const getUserNames = `
        SELECT user.name as name
        FROM user
        INNER JOIN follower
        ON user.user_id = follower.following_user_id;`;
  const dbResponse = await db.all(getUserNames);
  response.send(dbResponse);
});

// API6 (If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time)
app.get("/tweets/:tweetId/", authToken, async (request, response) => {
  let { tweetId } = request.params;
  const { username } = request;
  const getLoggedUserId = `
  SELECT user_id
  FROM user
  WHERE username= '${username}';`;
  const user = await db.get(getLoggedUserId);
  //   console.log(user.user_id);
  const isFollowing = `
    SELECT *
    FROM follower
    WHERE follower_user_id = ${user.user_id};`;
  const following = await db.get(isFollowing);
  if (following.following_user_id === null) {
    response.status(401);
    response.send("Invalid request");
  } else {
    const getUserNames = `
          SELECT a.tweet as tweet,
          SUM(c.like_id) as likes,
          SUM(b.reply_id) as replies,
          a.date_time as dateTime
          FROM tweet a
          INNER JOIN
          (reply b INNER JOIN like c
          ON b.tweet_id=c.tweet_id)
          ON a.tweet_id=b.tweet_id
          WHERE a.tweet_id = ${tweetId};`;
    const dbResponse = await db.get(getUserNames);
    //   console.log(dbResponse);
    response.send(dbResponse);
  }
});

// API7 (If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet)
const respInArr = (dbUser) => {
  return {
    likes: [dbUser.likes],
  };
};

app.get("/tweets/:tweetId/likes/", authToken, async (request, response) => {
  let { tweetId } = request.params;
  const { username } = request;
  const getLoggedUserId = `
  SELECT user_id
  FROM user
  WHERE username= '${username}';`;
  const user = await db.get(getLoggedUserId);
  //   console.log(user.user_id);
  const isFollowing = `
    SELECT *
    FROM follower
    WHERE follower_user_id = ${user.user_id};`;
  const following = await db.get(isFollowing);
  if (following.following_user_id === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getUserNames = `
          SELECT
          b.name as likes
          FROM tweet a
          INNER JOIN
          (user b INNER JOIN like c
          ON b.user_id=c.user_id)
          ON a.user_id = b.user_id
          WHERE a.tweet_id = ${tweetId};`;
    const dbResponse = await db.get(getUserNames);
    //   console.log(dbResponse);
    response.send(respInArr(dbResponse));
  }
});

// API 8 (If the user requests a tweet of a user he is following, return the list of replies.)
const respInArrs = (dbUser) => {
  return {
    replies: [{ name: dbUser.name, replies: dbUser.replies }],
  };
};

app.get("/tweets/:tweetId/replies/", authToken, async (request, response) => {
  let { tweetId } = request.params;
  const { username } = request;
  const getLoggedUserId = `
  SELECT user_id
  FROM user
  WHERE username= '${username}';`;
  const user = await db.get(getLoggedUserId);
  //   console.log(user.user_id);
  const isFollowing = `
    SELECT *
    FROM follower
    WHERE follower_user_id = ${user.user_id};`;
  const following = await db.get(isFollowing);
  if (following.following_user_id === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getUserNames = `
          SELECT
          b.reply as replies,
          c.name as name
          FROM tweet a
          INNER JOIN
          (reply b INNER JOIN user c
          ON b.user_id=c.user_id)
          ON a.user_id = b.user_id
          WHERE a.tweet_id = ${tweetId};`;
    const dbResponse = await db.get(getUserNames);
    // console.log(respInArrs(dbResponse));
    // console.log(dbResponse);
    response.send(respInArrs(dbResponse));
  }
});

// API 9 (Returns a list of all tweets of the user)
app.get("/user/tweets/", async (request, response) => {
  const getTweets = `
          SELECT a.tweet as tweet,
          c.like_id as likes,
          b.reply_id as replies,
          a.date_time as dateTime
          FROM tweet a
          INNER JOIN
          (reply b INNER JOIN like c
          ON b.tweet_id=c.tweet_id)
          ON a.tweet_id=b.tweet_id;`;
  const dbResponse = await db.all(getTweets);
  response.send(dbResponse);
});

app.post("/user/tweets/", authToken, async (request, response) => {
  const { tweet } = request.body;
  const addTweet = `
    INSERT INTO
    tweet (tweet)
    VALUES ('${tweet}');`;
  await db.run(addTweet);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getLoggedUserId = `
  SELECT user_id
  FROM user
  WHERE username= '${username}';`;
  const user = await db.get(getLoggedUserId);
  //   console.log(user.user_id);
  const isSame = `
    SELECT user_id
    FROM tweet
    WHERE  tweet_id = ${tweetId};`;
  const same = await db.get(isSame);
  //   console.log(tweetId, user);

  if (same === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else if (user.user_id !== same.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweet = `
        DELETE FROM tweet
        WHERE tweet_id=${tweetId};`;
    await db.run(deleteTweet);
    response.send("Tweet Removed");
  }
});

module.exports = app;
