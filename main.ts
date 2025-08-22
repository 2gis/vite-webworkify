import MyWorker from './worker.ts?webworkify';
// import MyWorker from './worker.ts?worker&inline';
import gamma from 'gamma';

const worker = MyWorker();
worker.addEventListener('message', (event) => {
    console.log('Message from worker:', event.data, 'main gamma', gamma(Math.random()));
});
setInterval(() => {
    worker.postMessage('Hello Worker!');
}, 1000);
