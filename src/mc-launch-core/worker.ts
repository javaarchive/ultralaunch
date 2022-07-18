// Adapted from my own https://glitch.com/edit/#!/simplified-apis?path=worker.js

class WorkerPool{
    avalible: number;
    inUse: boolean[];
    size: number;
    slotQueue: any[];
    executingTasks: number;
    waitingForEnd: any[];
    
	constructor(size: number){
		this.size = size;
		this.inUse = (new Array(size)).fill(false);
		this.avalible = size;
		this.slotQueue = [];
		this.executingTasks = 0;
		this.waitingForEnd = [];
	}
	updateTaskExecStatus(){
		if(this.executingTasks == 0){
			this.waitingForEnd.forEach((resolve) => resolve());
		}
	}
	waitForAllTasks(){
		if(this.executingTasks == 0){
			return;
		}
		return new Promise((resolve, reject) => {
			this.waitingForEnd.push(resolve);
		});
	}
	findSlot(){
		if(this.avalible == 0){
			return -1;
		}
		for(let i = 0; i < this.size; i ++){
			if(!this.inUse[i]){
				return i;
			}
		}
		return -1;
	}
	markSlotinUse(index: number){
		// console.log("Slot",index,"is now in use");
		this.inUse[index] = true;
		this.avalible --;
	}
	releaseSlot(index: number){
		// console.log("Slot",index,"is no longer in use");
		this.inUse[index] = false;
		if(this.slotQueue.length > 0){
			//console.log(this.slotQueue);
			let resolve = this.slotQueue.shift();
			//console.log("Got a",resolve);
			resolve(index);
		}
		this.avalible ++;
	}
	async acquireWorker(){
		if(this.avalible == 0){
			let slot: number = await (new Promise((resolve, reject) => {
				//console.log("Pushed",resolve);
				this.slotQueue.push(resolve);
			}));
			//console.log("Acquire Slot",slot);
			this.markSlotinUse(slot);
			let releaseFunc = () => this.releaseSlot(slot);
			return releaseFunc;
		}else{
			let slot = this.findSlot();
			//console.log("Acquire Slot Instant",slot);
			this.markSlotinUse(slot);
			let savedThis = this;
			let releaseFunc = function(){
				savedThis.releaseSlot(slot);
			};
			return releaseFunc;
		}
	}
	async runInWorker(func: Function){
		let onFinish = await this.acquireWorker();
		this.executingTasks ++;
		this.updateTaskExecStatus();
		try{
			await func(...Array.from(arguments).slice(1));
		}catch(ex){
			
		}
		this.executingTasks --;
		this.updateTaskExecStatus();
		await onFinish();
	}
	async runInWorkerNowait(func: Function){
		let onFinish = await this.acquireWorker();
		(async () => {
			this.executingTasks ++;
			this.updateTaskExecStatus();
			try{
				await func(...Array.from(arguments).slice(1));
			}catch(ex){

			}
			await onFinish();
			this.executingTasks --;
			this.updateTaskExecStatus();
		})();
	}
}
module.exports = {WorkerPool};
export {WorkerPool};