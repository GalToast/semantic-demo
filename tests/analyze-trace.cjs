const fs = require('fs');

const traceData = JSON.parse(fs.readFileSync('tmp/choreography-trace.json', 'utf8'));

// The trace is an object with a traceEvents array
const events = traceData.traceEvents || traceData;

const longTasks = [];
let layoutCount = 0;
let styleRecalcCount = 0;

for (const event of events) {
    if (event.ph === 'X' || event.ph === 'B' || event.ph === 'E') {
        // Durations are in microseconds
        if (event.dur && event.dur > 50000) {
            longTasks.push(event);
        }
    }
    
    if (event.name === 'UpdateLayoutTree') {
        layoutCount++;
    } else if (event.name === 'RecalculateStyles' || event.name === 'Layout') {
        styleRecalcCount++;
    }
}

console.log(`Total Events: ${events.length}`);
console.log(`Total Layout events: ${layoutCount}`);
console.log(`Total Style Recalculations: ${styleRecalcCount}`);
console.log(`Long Tasks (>50ms): ${longTasks.length}`);

// Group by name
const longTaskCounts = {};
for (const task of longTasks) {
    longTaskCounts[task.name] = (longTaskCounts[task.name] || 0) + 1;
}
console.log('Long Tasks by name:');
console.table(longTaskCounts);

// Find forced reflows (Layout events that happen synchronously during V8 execution)
// A simplistic check: Layout events with 'UpdateLayerTree' or 'HitTest' in call frames
const forcedLayouts = events.filter(e => e.name === 'Layout' && e.args && e.args.beginData && e.args.beginData.stackTrace);

console.log(`Potential forced synchronous layouts: ${forcedLayouts.length}`);
if (forcedLayouts.length > 0) {
    const triggers = forcedLayouts.map(l => l.args.beginData.stackTrace[0].functionName || 'anonymous');
    const triggerCounts = {};
    for (const t of triggers) {
        triggerCounts[t] = (triggerCounts[t] || 0) + 1;
    }
    console.log('Triggers for synchronous layout:');
    console.table(triggerCounts);
}
