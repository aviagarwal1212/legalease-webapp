// import EditorJS from '@editorjs/editorjs';
// import Header from '@editorjs/header'; 
// import List from '@editorjs/list';
const SUCCESS  = 0;
const WARNING  = 1;
const ERROR    = 2;
const TASK_TIME = 5000;

let app = new Vue({
    el: '#app',
    data:{
        errorType:{
            success: SUCCESS,
            warning: WARNING,
            error: ERROR,
        },
        editor: new EditorJS({
            holder: "left-container-body",
            // tools: { 
            //     header: Header, 
            //     list: List 
            //   },
            // autofocus: true,
            placeholder: "Type or paste your contract here and we will help you review it.",
            hideToolbar: false
        }),
        toastMessage:"No query found!",
        toastMessageType: ERROR,

        intervalID: null,
        textFieldContent:[],
        maxTextDisplayLimit: 10,
        topicData: "",
        questionData: "",
        queryData : [],
        riskData: [],
        anomalousTopics: [],
        anomalousClauses: [],
        status: "NONE",
        dummy : {
            "task_id": "d57fb01e-3192-454d-bc33-be095622c8f6",
            "task_status": "SUCCESS",
            "task_result": {
                "start_indexes": [
                    108
                ],
                "end_indexes": [
                    158
                ],
                "answers": [
                    " PACKING: To be packed in new strong wooden case(s) /carton(s), suitable for long distance transportation and for the change of climate, well protected against rough handling, moisture, rain, corrosion, shocks, rust, and freezing."
                ],
                "questions": [
                    "Packing"
                ],
                "details": [
                    "How should packing happen?"
                ],
                "anomalous_topics": [
                                            "conflict of interest",
                                            "bankruptcy",
                                            "redemption"
                                            ],
                "anomalous_clauses": [
                                      "Hi hello jane doe",
                                      "Im pickle rick"
                                      ],
            }
        }
    },
    methods:{
        processData(task){
            // console.log(task);
            let idGen = 0;
            this.riskData.splice(0);
            this.anomalousClauses.splice(0);
            this.anomalousTopics.splice(0);

            this.status = task["task_status"];
            
            if (this.status !== "SUCCESS"){
                return;
            }

            const result = task["task_result"];
            const answer = result["answers"];
            const question = result["questions"];
            const detail = result["details"];
            
            let len = answer.length;
            for(let i = 0; i < len; ++i, ++idGen){
                let obj = {
                    "answer" : answer[i],
                    "question" : question[i],
                    "detail" : detail[i],
                    "status" : this.status
                };
                this.riskData.push(obj);
            }

            for(let el of result["anomalous_clauses"]){
                this.anomalousClauses.push({
                    id : idGen,
                    data: el
                });
                ++idGen;
            }

            for(let el of result["anomalous_topics"]){
                this.anomalousTopics.push({
                    id : idGen,
                    data: el
                });
                ++idGen;
            }
        },

        isPending(){
            return this.status === "PENDING";
        },
        
        isFailure(){
            return this.status === "FAILURE";
        },

        trimString(text, size){
            if(text.length > size) return text.substring(0,size) + "...";
            return text;
        },

        submitQuery(){
            const topic = this.topicData;
            const question = this.questionData;

            if(topic === "" || question == ""){
                return;
            }

            this.queryData.push({
                topic,
                question,
            });

            this.topicData = "";
            this.questionData = "";

            // FIXME: send request to the server.
        },

        removeQuery(id){
            this.queryData.splice(id,1);
        },

        readTextField(){
            this.editor.save().then(data=>{
                let temp = [];
                if(data.blocks.length == 0) return;
                for(d of data.blocks) this.textFieldContent.push(d.data.text);
                if(this.queryData instanceof Array){
                    let user_details = [];
                    let user_questions = [];
                    
                    for(q of this.queryData){
                        user_details.push(q.topic);
                        user_questions.push(q.question);
                    }

                    const postData = {
                        contract: this.textFieldContent,
                        user_questions,
                        user_details
                    };
                    const curr_path = window.location.href;
                    // console.log(curr_path);
                    axios.post(`${curr_path}/create-allred-task`, postData)
                    .then(()=>{
                        this.createToast(SUCCESS,`Task Created, please wait for processing!`);
                    })
                    .catch(()=>{
                        this.createToast(ERROR,`unable to create task`);
                    });
                    
                    this.intervalID = null;
                    this.checkTaskCompletion();

                }else{
                    this.createToast(ERROR, "invalid or empty query data, please check!");
                }
            }).catch(err=>console.error(err));
        },

        closeToast(){
            $('.toast').toast('hide');
        },

        checkTaskCompletion(callback){
            // console.log("Hello");
            if(!this.intervalID){
                this.intervalID = setInterval(()=>{
                    const curr_path = window.location.href;
                    axios.get(`${curr_path}/task`)
                    .then((res)=>{
                        this.processData(res.data);
                        if(callback) callback(res.data);
                        if(res.data['task_status'] == 'SUCCESS'){
                            this.createToast(SUCCESS,`Task has been processed!`);
                            if(this.intervalID) clearInterval(this.intervalID);
                            this.intervalID = null;
                        }
                    })
                    .catch((err)=>{
                        this.createToast(ERROR,`Task has been corrupted: ${err}`);
                    });
                }, TASK_TIME);
            }
        },

        checkTaskOnDatabase(){
            const curr_path = window.location.href;
            axios.get(`${curr_path}/firebase-task`)
            .then((res)=>{
                const data = res.data;
                this.status = data.task_status;
                console.log(this.status)
                if( this.status === "SUCCESS"){
                    const result = data.result;
                    this.processQuery(data);
                    this.processData(data);
                    this.createToast(SUCCESS,`Task found on cache!`);
                }else if(this.status === "PENDING"){
                    this.checkTaskCompletion((data)=>{
                        this.processQuery(data);
                    });
                }

            })
            .catch((err)=>{
                this.status = "None";
                this.createToast(ERROR,`Task does not exist on cache! : ${err}`);
            });
        },

        processQuery(data){
            console.log("Hello");
            this.queryData.splice(0);

            if(!data.hasOwnProperty("userData")) return;
            const userData = data.userData;
            
            if(userData.hasOwnProperty("contract")) {
                for(let el of userData.contract) this.insertText(el);
                this.editor.blocks.delete(0);
            }
            
            if(!userData.hasOwnProperty("user_details")) return;
            const user_details = userData.user_details;
            const user_questions = userData.user_questions;
            for(let idx = 0; idx < user_details.length; ++idx){
                this.queryData.push({
                    topic : user_details[idx],
                    question : user_questions[idx],
                })
            }
        },

        createToast(errType, mess){
            this.toastMessageType = errType;
            this.toastMessage = mess;
            $('.toast').toast('show');
        },

        insertText(data) {
            this.editor.blocks.insert("paragraph", {text: data});
        },
        calScore(){
            let insightTotal = 0;
            let anomalyTotal = 0;
            if(this.riskData instanceof Array) insightTotal +=  this.riskData.length;
            if(this.anomalousTopics instanceof Array) anomalyTotal +=  this.anomalousTopics.length;
            if(this.anomalousClauses instanceof Array) anomalyTotal +=  this.anomalousClauses.length;
            if(insightTotal + anomalyTotal == 0) return 0;
            
            return Math.round((insightTotal / (insightTotal + anomalyTotal)) * 100);
        },
        percentageStyle(){
            return {
                width: this.calScore().toString() + "%"
            }
        }
    },
    mounted(){
        this.$nextTick(()=>{
            // this.processData(this.dummy);
            // console.log(this.anomalousTopics);
            // console.log(this.anomalousClauses);
            setTimeout(this.checkTaskOnDatabase, 1000);
        })
    }
});