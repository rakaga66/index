const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup({failSave=false,failRequest=false,onSave} = {}) {
    const nodes = {};
    const node = id => nodes[id] ||= {value:'',disabled:false,hidden:false,style:{},dataset:{},events:{},setAttribute(){},focus(){},addEventListener(name,callback){this.events[name]=callback;}};
    node('aiGenerateCount').value='10';
    const calls=[], saved=[];
    let saveFails=failSave;
    const context = {window:{},document:{getElementById:node,querySelectorAll:()=>[]},AbortSignal,Response,console,setTimeout};
    context.fetch=async (path,options)=>{
        calls.push(JSON.parse(options.body));
        if(failRequest) return Response.json({ok:false,message:'ai-invalid-key'},{status:502});
        return Response.json({ok:true,requestId:'ai-test-'+calls.length,requestedCount:calls.at(-1).count,questions:Array.from({length:calls.at(-1).count},(_,i)=>({question:'سؤال '+calls.length+' '+i,answer:'إجابة '+i}))});
    };
    vm.runInNewContext(fs.readFileSync('js/admin-ai-assistant.js','utf8'),context);
    const library={saveAiBatch:async data=>{if(saveFails){saveFails=false;throw new Error('network');}saved.push(data);onSave?.(node);return data.questions.length;}};
    const app=context.window.AdminAiAssistant.create({auth:{currentUser:{getIdToken:async()=>'test-token'}},library,getExisting:()=>[]});
    return {app,node,calls,saved};
}
test('10-question workflow splits requests and saves all batches',async()=>{
    const t=setup(); await t.app.generate(); assert.equal(t.calls.length,2); assert.equal(t.saved.length,2);
    assert.equal(t.calls[1].exclude.length,5); assert.equal(t.node('aiGenerateProgress').value,10);
    assert.equal(t.node('aiGenerateBtn').disabled,false); assert.match(t.node('aiGenerateResult').textContent,/10 من 10/);
});
test('save failure retains draft; retry saves without another provider call',async()=>{
    const t=setup({failSave:true}); await t.app.generate();
    assert.equal(t.node('aiRetrySaveBtn').hidden,false); assert.equal(t.node('aiGenerateBtn').disabled,true);
    await t.node('aiRetrySaveBtn').events.click(); assert.equal(t.calls.length,1); assert.equal(t.saved.length,1);
    assert.equal(t.node('aiRetrySaveBtn').hidden,true); assert.equal(t.node('aiGenerateBtn').disabled,false);
});
test('stop preserves current batch and prevents further provider calls',async()=>{
    const t=setup({onSave:node=>node('aiStopBtn').events.click()}); await t.app.generate();
    assert.equal(t.calls.length,1); assert.equal(t.saved.length,1); assert.match(t.node('aiGenerateResult').textContent,/تم الإيقاف/);
});
test('invalid key gives actionable failure and no fake results',async()=>{
    const t=setup({failRequest:true}); await t.app.generate(); assert.equal(t.saved.length,0);
    assert.match(t.node('aiGenerateResult').textContent,/رفض مفتاح API/); assert.equal(t.node('aiGenerateBtn').disabled,false);
});
test('double click does not launch concurrent generations',async()=>{
    const t=setup(); await Promise.all([t.app.generate(),t.app.generate()]); assert.equal(t.calls.length,2);
});
test('invalid count never contacts backend',async()=>{
    const t=setup();t.node('aiGenerateCount').value='1.5';await t.app.generate();assert.equal(t.calls.length,0);
});
