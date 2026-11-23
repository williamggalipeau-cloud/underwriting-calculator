const R = require("path").resolve(__dirname, "..", "..");const fs=require("fs");
const j=require(R+"/node_modules/jiti")(__filename,{alias:{"@":R}});
const c=j(R+"/lib/calculations.js");const la=j(R+"/lib/leaseApply.js");const {TEST_INPUTS}=j(R+"/lib/testScenario.js");
let fail=0;const ok=(cond,msg)=>{console.log((cond?"PASS ":"FAIL ")+msg);if(!cond)fail++;};
const near=(a,b,t=0.01)=>Math.abs(a-b)<=t;
const inputs={...TEST_INPUTS,acquisitionDate:"2026-12-01",rentPerSF:16,annualRentEscalationPct:3,holdPeriodYears:5,downtimeBetweenLeases:6};
const base={id:"u1",name:"101",squareFeet:1200,leaseStatus:"occupied",currentRentPSF:12,annualEscalationPct:3,monthsRemaining:24,newLeaseTerm:60,renewalProbabilityPct:50,downtimeBetweenLeases:6,tiRenewalPSF:0,tiNewPSF:0,freeRentMonthsNew:0,freeRentMonthsRenewal:0,creditLossPct:0};
// 1. Rent steps drive rent while the lease runs
const steps=[{start:"2026-01-01",end:"2027-02-28",rentPSF:12},{start:"2027-03-01",end:"2027-03-31",rentPSF:0},{start:"2027-04-01",end:"2028-11-30",rentPSF:13.2}];
const s1=c.simulateUnit({...base,rentSteps:steps},inputs,5);
const exp1=(3*12+1*0+8*13.2)*1200/12; // Dec26-Feb27 at 12, Mar27 abated, Apr-Nov27 at 13.2
ok(near(s1[0].revenue,exp1,0.5),`year-1 revenue follows the steps incl. an abated month (${s1[0].revenue.toFixed(2)} vs ${exp1.toFixed(2)})`);
const exp2=12*13.2*1200/12;
ok(near(s1[1].revenue,exp2,0.5),`year-2 revenue at the last step (${s1[1].revenue.toFixed(2)} vs ${exp2.toFixed(2)})`);
const s1b=c.simulateUnit(base,inputs,5);
ok(!near(s1b[0].revenue,exp1,1),"without steps the rent roll rent and escalation apply (unchanged engine)");
// 2. Steps ending before the lease ends: last step escalates
const s2=c.simulateUnit({...base,monthsRemaining:36,rentSteps:[{start:"2026-12-01",end:"2027-11-30",rentPSF:10}]},inputs,5);
const esc=Math.pow(1.03,1/12);let e2=0;let r=10;for(let m=0;m<12;m++){e2+=10*1200/12}
let y2=0;r=10*esc;for(let m=0;m<12;m++){y2+=r*1200/12;r*=esc;}
ok(near(s2[0].revenue,e2,0.5)&&near(s2[1].revenue,y2,0.5),`after the last step the rent escalates from it (${s2[1].revenue.toFixed(2)} vs ${y2.toFixed(2)})`);
// 3. Renewal option at 95% of market is exercised: no downtime, option rent
const opt={...base,renewalOptions:1,renewalOptionYears:3,renewalRentBasis:"95% of market"};
const s3=c.simulateUnit(opt,inputs,5);
const vac3=s3.reduce((a,y)=>a+y.vacancyLoss,0);
ok(vac3===0,`option exercised: no vacancy (vacancy loss ${vac3})`);
const mkt24=16*Math.pow(1.03,23/12); // market in the rollover month (m=23)
const y3first=0.95*mkt24*1200/12; // month 24 rent
ok(near(s3[2].revenue/12, y3first*Math.pow(1+0.03,0), y3first*0.05),`option rent ≈ 95% of market (yr-3 avg ${(s3[2].revenue/12).toFixed(2)} vs first month ${y3first.toFixed(2)})`);
const s3n=c.simulateUnit(base,inputs,5);
ok(s3n.reduce((a,y)=>a+y.vacancyLoss,0)>0,"without the option the usual renewal probability leaves downtime");
// 4. Greater of current rent and 95% of market, current above market → not exercised
const s4=c.simulateUnit({...opt,currentRentPSF:30,renewalRentBasis:"greater of current rent and 95% of market"},inputs,5);
ok(s4.reduce((a,y)=>a+y.vacancyLoss,0)>0,"option above market is not exercised (usual renewal applies)");
// 5. Fixed option rent above market → not exercised; below → exercised
ok(c.simulateUnit({...opt,renewalRentBasis:"fixed $25.00"},inputs,5).reduce((a,y)=>a+y.vacancyLoss,0)>0,"fixed option rent above market not exercised");
ok(c.simulateUnit({...opt,renewalRentBasis:"fixed $10.00"},inputs,5).reduce((a,y)=>a+y.vacancyLoss,0)===0,"fixed option rent below market exercised");
// 6. Options run out: one 1-year option then normal renewal
const s6=c.simulateUnit({...opt,monthsRemaining:6,renewalOptionYears:1},inputs,5);
ok(s6.reduce((a,y)=>a+y.vacancyLoss,0)>0,"after the last option, the usual renewal applies");
// ─ leaseApply ─
const abs=(n)=>JSON.parse(fs.readFileSync(R+"/docs/sample-leases/abstracts/"+fs.readdirSync(R+"/docs/sample-leases/abstracts").find(f=>f.startsWith(n))));
const inp={...inputs,acquisitionDate:"2026-11-22"};
const a2=abs("02");const {values:v2}=la.abstractUnitValues(a2,inp);
ok(v2.tenantName==="Desert Aero Parts LLC"&&v2.squareFeet===2000&&v2.leaseType==="MG"&&v2.leaseEnd==="2028-02-29"&&v2.currentRentPSF===15.5,"Airport Flex: tenant, SF, MG, end date, current step rent");
ok(v2.renewalOptions===1&&v2.renewalOptionYears===3&&v2.renewalNoticeMonths===6&&/greater of current rent/.test(v2.renewalRentBasis),"Airport Flex: renewal option read");
const a4=abs("04");const {values:v4}=la.abstractUnitValues(a4,inp);
ok(v4.squareFeet===3400&&near(v4.currentRentPSF,(3607.17+1659.17)*12/3400,0.01),`Harbor Light: two suites blended (${v4.currentRentPSF})`);
const a10=abs("10");const {values:v10}=la.abstractUnitValues(a10,inp);
ok(v10.terminationDate===""&&v10.renewalOptions===1&&v10.renewalNoticeMonths===9&&v10.renewalRentBasis==="95% of market","Lakeshore: amendment applied (no termination, one 5-yr option at 95%)");
const a5=abs("05");const {values:v5}=la.abstractUnitValues(a5,inp);
ok(v5.terminationDate==="2027-07-31"&&v5.terminationNoticeMonths===6&&v5.renewalOptions===0,"Ridgeway: termination right with 6-month notice");
const a9=abs("09");const {values:v9}=la.abstractUnitValues(a9,inp);
ok(v9.rentSteps[0].rentPSF===0&&v9.rentSteps[0].end==="2025-12-31","Granite Ave: abated first two months as a $0 step");
// apply to an existing unit
const unit={...base,id:"x",name:"Bay 12",tenantName:"Old Tenant",squareFeet:2200,currentRentPSF:14};
const rows=la.compareWithUnit(a10,unit,inp);
ok(rows.find(r=>r.key==="squareFeet").differs===false&&rows.find(r=>r.key==="tenantName").differs===true,"comparison: same SF not flagged, tenant flagged");
const mm=la.leaseMismatches(a10,unit,inp).map(r=>r.key);
ok(mm.includes("tenantName")&&mm.includes("currentRentPSF")&&!mm.includes("squareFeet")&&!mm.includes("monthsRemaining"),`mismatch flags: ${mm.join(",")}`);
const res=la.applyAbstract([unit],a10,{target:"x",fields:["tenantName","currentRentPSF","leaseEnd","rentSteps"],inputs:inp});
ok(res.units[0].tenantName==="North Texas Fleet Service LLC"&&res.units[0].currentRentPSF===15.57&&res.units[0].leaseEnd==="2028-02-29"&&res.units[0].monthsRemaining===v10.monthsRemaining&&res.units[0].rentSteps.length===5,"apply: ticked fields set, months remaining follows the end date");
ok(res.units[0].annualEscalationPct===3&&res.entries.length===4,"apply: unticked fields unchanged; 4 log entries");
ok(la.leaseMismatches(a10,res.units[0],inp).filter(r=>["tenantName","currentRentPSF","leaseEnd"].includes(r.key)).length===0,"applied fields no longer flagged");
// apply as a new unit
const mk=(name,sf)=>({id:"new1",name,squareFeet:sf,leaseStatus:"occupied",currentRentPSF:16,monthsRemaining:1,newLeaseTerm:60,renewalProbabilityPct:60,tenantName:""});
const res2=la.applyAbstract([unit],a2,{target:"new",inputs:inp,newUnit:mk,unitName:"Suite 105"});
const nu=res2.units[1];
ok(res2.units.length===2&&nu.name==="Suite 105"&&nu.tenantName==="Desert Aero Parts LLC"&&nu.squareFeet===2000&&nu.rentSteps.length===3&&la.leaseMismatches(a2,nu,inp).length===0,"new unit prefilled from the abstract, no mismatches");
// engine on an applied unit runs and yields rent from steps
const sim=c.simulateUnit({...nu,annualEscalationPct:3.33},inp,5);
ok(near(sim[0].revenue,(4*15.5+8*16)*2000/12,1),`applied unit: year-1 revenue from the steps (${sim[0].revenue.toFixed(2)})`);
console.log(fail?fail+" FAILED":"ALL PASS");process.exit(fail?1:0);
