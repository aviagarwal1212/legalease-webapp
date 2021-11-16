const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const { initializeApp } = require("firebase/app");
const firebaseConfig = require("./firebase_config.json");
const firebaseApp = initializeApp(firebaseConfig);
const firebaseDatabase = require("firebase/database");
const databaseInstance = firebaseDatabase.getDatabase(firebaseApp);

const app = express();
const port = 8000;
const mainAPI = require("./allred_config.json").MLServer + "/tasks";
const TASK_TIME = 5000;

let taskID = null;
let taskData = null;
let intervalID = null;

app.use(express.static(__dirname));
// app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const getProcessedData = () => {
  if (!intervalID) {
    intervalID = setInterval(() => {
      if (taskData) {
        clearInterval(intervalID);
        intervalID = null;
        return;
      }
      console.log(taskID);
      if (!taskID) return;
      axios
        .get(`${mainAPI}/${taskID}`)
        .then((res) => {
          const status = res.data.task_status;
          taskData = res.data;
          if (status == "PENDING") {
            taskData = null;
          }
        })
        .catch((err) => console.error(err));
    }, TASK_TIME);
  }
};

const writeToFirebase = (sessionID, query) => {
    if (sessionID == null) return null;
    if (query == null) {
        query = {
        taskID: null,
        userData: null,
        result: null,
        };
    }
    const databaseRef = firebaseDatabase.ref(databaseInstance, path.join('users', sessionID.toString()));
    firebaseDatabase.set(databaseRef,query)
        .then(() => console.log("Success in storeing the data"))
        .catch((err) =>console.error(`Err: ${err}`));
};

const readFromFirebase = (sessionID, callback) => {
    if (sessionID == null) {
        return callback(null);
    }
    const databaseRef = firebaseDatabase.ref(databaseInstance, path.join('users', sessionID.toString()));
    return firebaseDatabase.get(databaseRef)
        .then( (snap) =>{
            const data = snap.val();
            return callback(data);
        }).catch(() => {
            return false
        });
};

const updateResultInFirebase = async (sessionID, result) => {
    if (sessionID == null || result == null) return null;
    const databaseRef = firebaseDatabase.ref(databaseInstance, path.join('users', sessionID.toString()));
    
    let updates = {
        ...result,
        task_status : "SUCCESS"
    }

    let resultChild = firebaseDatabase.child(databaseRef, 'task_result');
    let statusChild = firebaseDatabase.child(databaseRef, 'task_status');
    firebaseDatabase.push(resultChild);
    firebaseDatabase.push(statusChild);
    firebaseDatabase.update(databaseRef, updates);
};


app.get("/", (req, res) => {
  const sessionID = uuidv4();
  res.redirect(`/${sessionID}`);
});

app.get("/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

app.post("/:id/create-allred-task", (req, res) => {
    taskID = null;
    taskData = null;
    const orgParam = req.body;
    const contract = orgParam.contract.join("\n");
    const param = {
        contract,
        user_questions: orgParam.user_questions,
        user_details: orgParam.user_details,
    };

    axios.post(mainAPI, param)
        .then((res) => {
            taskID = res.data.task_id;
            writeToFirebase(req.params.id, {
                taskID,
                userData: orgParam,
                task_result: null,
            });
        })
        .catch((err) => console.error(err));
  getProcessedData();
  res.send({});
});

app.get("/:id/task", (req, res) => {
    if (taskData) {
        updateResultInFirebase(req.params.id,{task_result : taskData['task_result']});
        readFromFirebase(req.params.id, (data)=>{
            res.send(data);
        })
        if(intervalID) clearInterval(intervalID);
    } else {
        res.send({
            task_status: "PENDING",
        });
  }
});

app.get("/:id/firebase-task", (req, res) => {
    taskID = null;
    readFromFirebase(req.params.id, result =>{
        if(result == null) return false;
        taskID = result['taskID'];
        if (!result.hasOwnProperty('task_status')){
            return false;
        }else {
            if(!result.hasOwnProperty('task_result')){
                const task_result = {
                    answers: [], 
                    questions: [], 
                    details: [],
                    anomalous_clauses: [],
                    anomalous_topics: [],
                };
                res.send({...result, task_result});
            }else
                res.send(result);
            return true;
        }
    }).then(val =>{
        if(!val && taskID){
            taskData = null;
            getProcessedData();
            res.redirect(`/${req.params.id}/task`);
            return;
        }   
    }).catch(()=>res.status(404).send("Task does not exist"));
    
});

app.all('*', (req,res)=>{
    res.status(404).send("Page not Found");
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
