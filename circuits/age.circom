pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

template AgeCheck() {
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;

    signal input currentYear;
    signal input currentMonth;
    signal input currentDay;

    signal input minimumAge;

    signal output eligible;

    signal yearPassed;
    signal sameYear;

    signal monthPassed;
    signal sameMonth;

    signal dayPassed;

    signal eligibleByYear;
    signal eligibleByMonth;
    signal eligibleByDay;
    signal sameYearAndMonth;

    component yearCheck = LessThan(12);
    yearCheck.in[0] <== birthYear + minimumAge;
    yearCheck.in[1] <== currentYear;
    yearPassed <== yearCheck.out;

    
    component yearEqual = IsEqual();
    yearEqual.in[0] <== birthYear + minimumAge;
    yearEqual.in[1] <== currentYear;
    sameYear <== yearEqual.out;

    component monthCheck = LessThan(5);
    monthCheck.in[0] <== birthMonth;
    monthCheck.in[1] <== currentMonth;
    monthPassed <== monthCheck.out;

   
    component monthEqual = IsEqual();
    monthEqual.in[0] <== birthMonth;
    monthEqual.in[1] <== currentMonth;
    sameMonth <== monthEqual.out;

    component dayCheck = LessThan(6);
    dayCheck.in[0] <== birthDay;
    dayCheck.in[1] <== currentDay + 1;
    dayPassed <== dayCheck.out;

  
    eligibleByYear <== yearPassed;
    eligibleByMonth <== sameYear * monthPassed;
    sameYearAndMonth <== sameYear * sameMonth;
    eligibleByDay <== sameYearAndMonth * dayPassed;
    eligible <== eligibleByYear + eligibleByMonth + eligibleByDay;
}

component main = AgeCheck();
