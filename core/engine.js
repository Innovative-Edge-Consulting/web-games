// /core/engine.js — Wordscend game engine
(function(global){
  const Engine={
    allowed:null,answer:'',rows:6,cols:5,board:[],cursor:{row:0,col:0},marks:[],done:false,
    init(cfg){this.rows=cfg.rows;this.cols=cfg.cols;this.board=Array.from({length:this.rows},()=>Array(this.cols).fill(''));
      this.cursor={row:0,col:0};this.marks=[];this.done=false;return cfg;},
    setAllowed(a){this.allowed=a;},
    setAnswer(a){this.answer=String(a||'').toUpperCase();},
    getBoard(){return this.board;},
    getCursor(){return this.cursor;},
    getRowMarks(){return this.marks;},
    isDone(){return this.done;},
    addLetter(ch){if(this.done)return false;ch=ch.toUpperCase();const{row,col}=this.cursor;
      if(col>=this.cols)return false;this.board[row][col]=ch;this.cursor.col++;return true;},
    backspace(){if(this.done)return false;const{row,col}=this.cursor;if(col<=0)return false;
      this.cursor.col--;this.board[row][this.cursor.col]='';return true;},
    submitRow(){
      if(this.done)return{ok:false,reason:'done'};
      const guess=this.board[this.cursor.row].join('');
      if(guess.length<this.cols)return{ok:false,reason:'incomplete'};
      if(!this.allowed?.has(guess))return{ok:false,reason:'invalid'};
      const res=this.judge(guess);
      this.marks[this.cursor.row]=res;
      const win=res.every(m=>m==='correct');
      this.cursor.row++;this.cursor.col=0;
      if(win||this.cursor.row>=this.rows)this.done=true;
      return{ok:true,win,done:this.done,attempt:this.cursor.row,marks:res};
    },
    judge(word){
      word=word.toUpperCase();const ans=this.answer.split('');
      const mark=Array(this.cols).fill('absent');
      for(let i=0;i<this.cols;i++){if(word[i]===ans[i]){mark[i]='correct';ans[i]='*';}}
      for(let i=0;i<this.cols;i++){if(mark[i]!=='correct'){
        const j=ans.indexOf(word[i]);if(j>-1){mark[i]='present';ans[j]='*';}}}
      return mark;
    },
    getKeyStatus(){
      const s={};for(let r of this.marks)r.forEach((m,i)=>{
        const ch=this.board[this.marks.indexOf(r)][i];if(!ch)return;
        if(!s[ch]||s[ch]==='present'&&m==='correct')s[ch]=m;else if(!s[ch])s[ch]=m;
      });return s;
    }
  };
  global.WordscendEngine=Engine;
})(window);
