pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

template AgeCheck() {
    signal input birthYear;
    signal input currentYear;
    signal input minimumAge;

    signal output eligible;

    component cmp = LessThan(8);

    cmp.in[0] <== birthYear + minimumAge;
    cmp.in[1] <== currentYear;

    eligible <== 1 - cmp.out;
}

component main = AgeCheck();